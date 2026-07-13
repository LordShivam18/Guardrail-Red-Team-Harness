import type { RobustnessCertificate, RobustnessScope } from "@/lib/sovereign/types";

export type RandomizedSmoothingInput = {
  sampleCount: number;
  alpha: number;
  countA: number;
  countB: number;
  scope: RobustnessScope;
  noiseStandardDeviation?: number;
  certifiedTokenDeletionRadius?: number;
};

/**
 * Certifies a dominant safety class under a declared smoothing distribution.
 *
 * `alpha` is the total failure probability. The lower bound for A and upper
 * bound for B each use alpha / 2, yielding a joint confidence of at least
 * 1 - alpha by the union bound. The L2 radius is valid only for the declared
 * Gaussian embedding distribution and immutable model/tokenizer artifacts.
 */
export function verifyRandomizedSmoothing(
  input: RandomizedSmoothingInput
): RobustnessCertificate {
  const scope = normalizeScope(input);

  if (!hasValidCounts(input) || scope.sampleCount < 2) {
    return abstain(scope, 0, 1);
  }

  const z = inverseStandardNormal(1 - input.alpha / 2);
  const pA = wilsonLowerBound(input.countA, input.sampleCount, z);
  const pB = wilsonUpperBound(input.countB, input.sampleCount, z);

  if (!Number.isFinite(pA) || !Number.isFinite(pB) || pA <= pB) {
    return abstain(scope, pA, pB);
  }

  if (scope.representation === "token-ablation") {
    const radius = input.certifiedTokenDeletionRadius;

    if (typeof radius !== "number" || !Number.isInteger(radius) || radius < 0) {
      return abstain(scope, pA, pB);
    }

    return {
      decision: "CERTIFIED",
      pA,
      pB,
      epsilonRadius: radius,
      scope
    };
  }

  const sigma = input.noiseStandardDeviation ?? 1;

  if (!Number.isFinite(sigma) || sigma <= 0) {
    return abstain(scope, pA, pB);
  }

  const radius = (sigma / 2) * (inverseStandardNormal(pA) - inverseStandardNormal(pB));

  if (!Number.isFinite(radius) || radius <= 0) {
    return abstain(scope, pA, pB);
  }

  return {
    decision: "CERTIFIED",
    pA,
    pB,
    epsilonRadius: radius,
    scope
  };
}

function normalizeScope(input: RandomizedSmoothingInput): RobustnessScope {
  return {
    ...input.scope,
    sampleCount: input.sampleCount,
    alpha: input.alpha
  };
}

function hasValidCounts(input: RandomizedSmoothingInput) {
  return (
    Number.isInteger(input.sampleCount) &&
    input.sampleCount >= 0 &&
    Number.isInteger(input.countA) &&
    Number.isInteger(input.countB) &&
    input.countA >= 0 &&
    input.countB >= 0 &&
    input.countA + input.countB <= input.sampleCount &&
    Number.isFinite(input.alpha) &&
    input.alpha > 0 &&
    input.alpha < 1
  );
}

function abstain(scope: RobustnessScope, pA: number, pB: number): RobustnessCertificate {
  return {
    decision: "ABSTAIN",
    pA: clampProbability(pA),
    pB: clampProbability(pB),
    epsilonRadius: null,
    scope
  };
}

function wilsonLowerBound(successes: number, trials: number, z: number) {
  const proportion = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = proportion + z ** 2 / (2 * trials);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * trials)) / trials);
  return clampProbability((center - margin) / denominator);
}

function wilsonUpperBound(successes: number, trials: number, z: number) {
  const proportion = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = proportion + z ** 2 / (2 * trials);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * trials)) / trials);
  return clampProbability((center + margin) / denominator);
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return value <= 0 ? 0 : 1;
  return Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, value));
}

// Peter John Acklam's rational approximation, accurate enough for certification bounds.
function inverseStandardNormal(probability: number) {
  const p = clampProbability(probability);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];

  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export type SafetyVolatilityMetrics = {
  sampleSize: number;
  baselineThreshold: number;
  meanSafetyConfidence: number;
  variance: number;
  standardDeviation: number;
  safetySharpeRatio: number;
};

export function calculateSafetyVolatility(
  confidenceScores: number[],
  baselineThreshold = 0.95
): SafetyVolatilityMetrics {
  const samples = confidenceScores
    .filter((score) => Number.isFinite(score))
    .map((score) => clamp(score, 0, 1));
  const threshold = clamp(baselineThreshold, 0, 1);

  if (samples.length === 0) {
    return {
      sampleSize: 0,
      baselineThreshold: threshold,
      meanSafetyConfidence: 0,
      variance: 0,
      standardDeviation: 0,
      safetySharpeRatio: 0
    };
  }

  const meanSafetyConfidence =
    samples.reduce((total, score) => total + score, 0) / samples.length;
  const variance =
    samples.reduce((total, score) => total + (score - meanSafetyConfidence) ** 2, 0) /
    samples.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    sampleSize: samples.length,
    baselineThreshold: threshold,
    meanSafetyConfidence,
    variance,
    standardDeviation,
    safetySharpeRatio:
      standardDeviation === 0
        ? getZeroVarianceSafetySharpeRatio(meanSafetyConfidence, threshold)
        : (meanSafetyConfidence - threshold) / standardDeviation
  };
}

function getZeroVarianceSafetySharpeRatio(meanSafetyConfidence: number, baselineThreshold: number) {
  return meanSafetyConfidence >= baselineThreshold ? 100 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

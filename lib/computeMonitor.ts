const DEFAULT_BASELINE_WINDOW_SIZE = 100;
const MIN_BASELINE_WINDOW_SIZE = 5;

export type ComputeTelemetry = {
  ttft: number;
  tokenVelocity: number;
  computeShift: number;
};

const latencyWindow: number[] = [];

export function trackLatencyMetrics(
  startTime: [number, number],
  totalTokens: number
): ComputeTelemetry {
  const currentRunLatency = sanitizeMetric(getElapsedMilliseconds(startTime));
  const baseline = getBaselineStats();
  const computeShift = getComputeShift(currentRunLatency, baseline);
  const elapsedSeconds = currentRunLatency / 1_000;
  const safeTokenCount = Math.max(0, Math.trunc(Number.isFinite(totalTokens) ? totalTokens : 0));

  recordLatency(currentRunLatency);

  return {
    ttft: roundMetric(currentRunLatency),
    tokenVelocity:
      safeTokenCount === 0 || elapsedSeconds <= 0 || !Number.isFinite(elapsedSeconds)
        ? 0
        : roundMetric(safeTokenCount / elapsedSeconds),
    computeShift: roundMetric(computeShift)
  };
}

function getElapsedMilliseconds(startTime: [number, number]) {
  const [seconds, nanoseconds] = process.hrtime(startTime);
  return seconds * 1_000 + nanoseconds / 1_000_000;
}

function getBaselineStats() {
  if (latencyWindow.length === 0) {
    return {
      meanLatency: 0,
      standardDeviation: 0
    };
  }

  const meanLatency =
    latencyWindow.reduce((total, latency) => total + latency, 0) / latencyWindow.length;
  const variance =
    latencyWindow.reduce((total, latency) => total + (latency - meanLatency) ** 2, 0) /
    latencyWindow.length;

  return {
    meanLatency,
    standardDeviation: Math.sqrt(variance)
  };
}

function getComputeShift(
  currentRunLatency: number,
  baseline: { meanLatency: number; standardDeviation: number }
) {
  if (
    baseline.standardDeviation <= 0 ||
    !Number.isFinite(baseline.standardDeviation) ||
    !Number.isFinite(baseline.meanLatency) ||
    !Number.isFinite(currentRunLatency)
  ) {
    return 0;
  }

  return (currentRunLatency - baseline.meanLatency) / baseline.standardDeviation;
}

function recordLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs)) {
    return;
  }

  latencyWindow.push(latencyMs);

  while (latencyWindow.length > getBaselineWindowSize()) {
    latencyWindow.shift();
  }
}

function getBaselineWindowSize() {
  const parsed = Number(process.env.COMPUTE_BASELINE_WINDOW_SIZE ?? DEFAULT_BASELINE_WINDOW_SIZE);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_BASELINE_WINDOW_SIZE;
  }

  return Math.max(Math.trunc(parsed), MIN_BASELINE_WINDOW_SIZE);
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(4));
}

function sanitizeMetric(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

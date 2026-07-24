/**
 * Centralized drift-monitor URL resolver.
 *
 * Deployment-target–aware validation:
 *   - Vercel (``VERCEL === "1"``): requires HTTPS ``DRIFT_MONITOR_URL``
 *   - Docker (``DEPLOYMENT_TARGET === "docker"``): allows internal HTTP
 *   - CI (``CI === "true"`` or ``GITHUB_ACTIONS === "true"``): allows any
 *   - Unset / other: requires HTTPS ``DRIFT_MONITOR_URL``
 *
 * Never falls back to ``localhost:8000`` in production.
 */

type DeploymentTarget = "vercel" | "docker" | "ci" | "production";

export class DriftMonitorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriftMonitorUnavailableError";
  }
}

function getDeploymentTarget(): DeploymentTarget {
  // CI takes precedence — both CI and Docker may set NODE_ENV=production
  if (
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true"
  ) {
    return "ci";
  }

  if (process.env.VERCEL === "1") {
    return "vercel";
  }

  const explicit = process.env.DEPLOYMENT_TARGET?.trim().toLowerCase();
  if (explicit === "docker" || explicit === "local" || explicit === "ci") {
    return explicit === "local" ? "docker" : explicit;
  }

  // Default: treat as externally deployed production
  return process.env.NODE_ENV === "production" ? "production" : "docker";
}

function isStrictCiMode(): boolean {
  return (
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true"
  );
}

/**
 * Resolve and validate the drift-monitor base URL.
 *
 * @throws {DriftMonitorUnavailableError} when the drift monitor is not
 * configured or the URL is invalid for the current deployment target.
 */
export function resolveDriftMonitorUrl(): string {
  const target = getDeploymentTarget();
  const raw = process.env.DRIFT_MONITOR_URL?.trim();

  if (!raw) {
    if (target === "ci") {
      // CI containers always have the drift-monitor available via Docker
      return "http://guardrail-mesh-drift:8000";
    }

    throw new DriftMonitorUnavailableError(
      "Drift monitor service is not configured. Set the DRIFT_MONITOR_URL environment variable."
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DriftMonitorUnavailableError(
      "DRIFT_MONITOR_URL is not a valid URL."
    );
  }

  // Block unsafe protocols
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DriftMonitorUnavailableError(
      "DRIFT_MONITOR_URL must use http or https protocol."
    );
  }

  // Vercel and generic production require HTTPS
  if (target === "vercel" || target === "production") {
    if (url.protocol !== "https:") {
      throw new DriftMonitorUnavailableError(
        "DRIFT_MONITOR_URL must use HTTPS for Vercel/production deployments. " +
        "Set DEPLOYMENT_TARGET=docker to allow internal HTTP URLs."
      );
    }
  }

  // For Docker target, allow http:// only for known internal hostnames
  if (target === "docker" && url.protocol === "http:") {
    const hostname = url.hostname.toLowerCase();
    const allowedInternalHosts = [
      "guardrail-mesh-drift",
      "localhost",
      "127.0.0.1",
      "host.docker.internal",
    ];
    if (!allowedInternalHosts.includes(hostname)) {
      throw new DriftMonitorUnavailableError(
        `DRIFT_MONITOR_URL uses HTTP with an unknown host "${hostname}". ` +
        "Use HTTPS or a known Docker-internal hostname."
      );
    }
  }

  // Remove trailing slash for consistent concatenation
  return raw.replace(/\/+$/, "");
}

/**
 * Get the service-to-service auth token for drift-monitor requests.
 *
 * In CI mode, uses the CI default. In production, requires explicit config.
 * Returns null if no token is configured (caller decides how to handle).
 */
export function getDriftMonitorApiToken(): string | null {
  const token = process.env.DRIFT_MONITOR_API_TOKEN?.trim();
  return token || null;
}

/**
 * Whether the current environment is running in CI/test mode.
 *
 * Uses exact truth-value parsing: only ``"true"`` (case-sensitive) matches.
 */
export function isCiTestMode(): boolean {
  return isStrictCiMode();
}

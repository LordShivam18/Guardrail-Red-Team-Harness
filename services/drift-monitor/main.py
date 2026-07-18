"""Post-market token-distribution drift monitoring service.

The service compares a baseline token distribution (P) with a live token
distribution (Q) using KL divergence.  Distribution inputs may be normalized
probabilities or non-negative counts; they are normalized before comparison.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
from datetime import datetime, timezone
from typing import Any

import numpy as np
import requests
from fastapi import FastAPI
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from scipy.special import rel_entr


LOGGER = logging.getLogger("guardrail_mesh.drift_monitor")

DRIFT_THRESHOLD = 0.15
DEFAULT_WEBHOOK_URL = "http://localhost:3000/api/webhooks/drift"
DEFAULT_WEBHOOK_TIMEOUT_SECONDS = 5.0


class DriftAnalysisRequest(BaseModel):
    """Input for a KL-divergence comparison.

    ``baseline``/``live`` and ``P``/``Q`` are accepted as compatibility
    aliases, while the documented request keys remain
    ``baseline_distribution`` and ``live_distribution``.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    baseline_distribution: list[float] = Field(
        ...,
        min_length=1,
        validation_alias=AliasChoices("baseline_distribution", "baseline", "P", "p"),
        description="Baseline token probabilities or non-negative token counts (P).",
    )
    live_distribution: list[float] = Field(
        ...,
        min_length=1,
        validation_alias=AliasChoices("live_distribution", "live", "Q", "q"),
        description="Live token probabilities or non-negative token counts (Q).",
    )
    model_id: str | None = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("model_id", "modelId"),
        description="Optional model identifier included in a drift alert.",
    )
    model_version: str | None = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("model_version", "modelVersion"),
        description="Optional model version included in a drift alert.",
    )

    @field_validator("baseline_distribution", "live_distribution", mode="before")
    @classmethod
    def distributions_must_be_json_number_arrays(cls, value: Any) -> Any:
        if not isinstance(value, list):
            raise ValueError("must be a JSON array of numbers")

        if any(isinstance(item, bool) or not isinstance(item, (int, float)) for item in value):
            raise ValueError("must contain only JSON numbers")

        return value

    @field_validator("baseline_distribution", "live_distribution")
    @classmethod
    def distributions_must_be_finite_and_non_negative(cls, value: list[float]) -> list[float]:
        distribution = np.asarray(value, dtype=np.float64)

        if not np.isfinite(distribution).all():
            raise ValueError("must contain only finite numbers")
        if np.any(distribution < 0):
            raise ValueError("must not contain negative values")
        total = float(distribution.sum())
        if not math.isfinite(total) or total <= 0:
            raise ValueError("must have a finite, positive total")

        return value

    @field_validator("model_id", "model_version")
    @classmethod
    def normalize_optional_identifiers(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def distributions_must_share_a_token_index(self) -> "DriftAnalysisRequest":
        if len(self.baseline_distribution) != len(self.live_distribution):
            raise ValueError(
                "baseline_distribution and live_distribution must have the same length"
            )

        return self


app = FastAPI(
    title="Guardrail Mesh Drift Monitor",
    version="1.0.0",
    description="Post-market statistical drift detection using KL divergence.",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Lightweight health endpoint for the isolated container mesh."""

    return {"status": "ok"}


@app.post("/api/analyze-drift")
def analyze_drift(request: DriftAnalysisRequest) -> dict[str, Any]:
    """Calculate KL(P || Q) and alert the Next.js control plane on drift."""

    baseline = _normalize_distribution(request.baseline_distribution)
    live = _normalize_distribution(request.live_distribution)
    divergence = float(np.sum(rel_entr(baseline, live)))
    drift_detected = divergence > DRIFT_THRESHOLD

    response: dict[str, Any] = {
        "drift_detected": drift_detected,
        "threshold": DRIFT_THRESHOLD,
        # JSON cannot represent IEEE infinity.  The paired boolean preserves
        # the exact result for a nonzero P bucket where Q is zero.
        "kl_divergence": divergence if math.isfinite(divergence) else None,
        "kl_divergence_is_infinite": math.isinf(divergence),
        "webhook": {"attempted": False, "delivered": False},
    }

    if not drift_detected:
        return response

    alert_payload = {
        "event": "model.drift_detected",
        "model_id": request.model_id,
        "model_version": request.model_version,
        "kl_divergence": divergence if math.isfinite(divergence) else None,
        "kl_divergence_is_infinite": math.isinf(divergence),
        "threshold": DRIFT_THRESHOLD,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    response["webhook"] = _dispatch_drift_webhook(alert_payload)
    return response


def _normalize_distribution(values: list[float]) -> np.ndarray:
    """Convert a validated list of probabilities/counts into a distribution."""

    distribution = np.asarray(values, dtype=np.float64)
    return distribution / distribution.sum()


def _dispatch_drift_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Attempt the internal webhook without making alert delivery a false negative.

    Docker Compose should set ``DRIFT_WEBHOOK_URL`` to
    ``http://guardrail-mesh-web:3000/api/webhooks/drift``.  The local default
    keeps direct development simple.  If ``DRIFT_WEBHOOK_SECRET`` is set, the
    raw, deterministically serialized JSON body is HMAC-SHA256 signed in the
    ``x-mesh-signature`` header.
    """

    webhook_url = os.getenv("DRIFT_WEBHOOK_URL", DEFAULT_WEBHOOK_URL).strip()
    if not webhook_url:
        LOGGER.error("Drift detected but DRIFT_WEBHOOK_URL is empty.")
        return {
            "attempted": False,
            "delivered": False,
            "error": "webhook URL is not configured",
        }

    body = json.dumps(
        payload,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "guardrail-mesh-drift-monitor/1.0",
    }

    webhook_secret = os.getenv("DRIFT_WEBHOOK_SECRET")
    if webhook_secret:
        headers["x-mesh-signature"] = hmac.new(
            webhook_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()

    try:
        webhook_response = requests.post(
            webhook_url,
            data=body,
            headers=headers,
            timeout=_webhook_timeout_seconds(),
        )
    except requests.RequestException:
        LOGGER.exception("Drift webhook request failed.")
        return {
            "attempted": True,
            "delivered": False,
            "error": "webhook request failed",
        }

    delivered = 200 <= webhook_response.status_code < 300
    if not delivered:
        LOGGER.error("Drift webhook returned HTTP %s.", webhook_response.status_code)

    return {
        "attempted": True,
        "delivered": delivered,
        "status_code": webhook_response.status_code,
    }


def _webhook_timeout_seconds() -> float:
    """Read a bounded timeout so an unavailable control plane cannot hang analysis."""

    configured_timeout = os.getenv(
        "DRIFT_WEBHOOK_TIMEOUT_SECONDS", str(DEFAULT_WEBHOOK_TIMEOUT_SECONDS)
    )
    try:
        timeout = float(configured_timeout)
    except ValueError:
        LOGGER.warning(
            "Invalid DRIFT_WEBHOOK_TIMEOUT_SECONDS value; using %s seconds.",
            DEFAULT_WEBHOOK_TIMEOUT_SECONDS,
        )
        return DEFAULT_WEBHOOK_TIMEOUT_SECONDS

    return min(max(timeout, 0.1), 60.0)

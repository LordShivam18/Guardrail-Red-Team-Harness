"""Unit tests for FastAPI service-to-service authentication in main.py.

Tests missing, invalid, and valid service tokens on protected endpoints and
proves /health remains unauthenticated.

Run with: python -m unittest discover -s services/drift-monitor -p "test_*.py"
"""

import os
import unittest
from unittest import mock

from fastapi.testclient import TestClient

# Set up test environment variable before importing app
os.environ["DRIFT_MONITOR_API_TOKEN"] = "test_secret_token_12345"

from main import app

client = TestClient(app)


class TestServiceAuthentication(unittest.TestCase):
    """Test suite for FastAPI service-to-service token authorization."""

    def test_health_endpoint_unauthenticated(self):
        """Proves /health endpoint works without Authorization header."""
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_protected_endpoint_missing_token_returns_401(self):
        """Proves requests with missing Authorization header return 401."""
        response = client.post(
            "/api/generate-swarm-attack",
            json={"target_context": "test"}
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing service credentials", response.json()["detail"])

    def test_protected_endpoint_invalid_token_returns_403(self):
        """Proves requests with invalid bearer token return 403."""
        response = client.post(
            "/api/generate-swarm-attack",
            headers={"Authorization": "Bearer invalid_secret_token"},
            json={"target_context": "test"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Invalid service credentials", response.json()["detail"])

    def test_protected_endpoint_valid_token_succeeds(self):
        """Proves requests with valid bearer token pass authentication."""
        with mock.patch.dict(os.environ, {"CI": "true"}):
            response = client.post(
                "/api/generate-swarm-attack",
                headers={"Authorization": "Bearer test_secret_token_12345"},
                json={"target_context": "test context"}
            )
            self.assertEqual(response.status_code, 200)
            self.assertIn("swarm_payload", response.json())

    def test_dlp_scrubber_endpoint_auth(self):
        """Proves /api/dlp-scrubber requires valid token."""
        # Unauthenticated -> 401
        res1 = client.post("/api/dlp-scrubber", json={"text": "hello"})
        self.assertEqual(res1.status_code, 401)

        # Valid token -> 200
        res2 = client.post(
            "/api/dlp-scrubber",
            headers={"Authorization": "Bearer test_secret_token_12345"},
            json={"text": "hello world"}
        )
        self.assertEqual(res2.status_code, 200)

    @mock.patch.dict(os.environ, {"DRIFT_MONITOR_API_TOKEN": ""}, clear=True)
    def test_unconfigured_token_returns_503(self):
        """Proves that when DRIFT_MONITOR_API_TOKEN is unconfigured, protected endpoints return 503."""
        response = client.post(
            "/api/generate-swarm-attack",
            headers={"Authorization": "Bearer test_secret_token_12345"},
            json={"target_context": "test"}
        )
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()

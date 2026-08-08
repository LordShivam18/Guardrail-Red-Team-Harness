"""Unit tests for the drift-monitor DLP lazy initializer.

All tests mock AnalyzerEngine / AnonymizerEngine so they run without
the large ``en_core_web_lg`` spaCy model being installed locally.
The real model is verified separately inside the Docker image build.
"""

import logging
import os
import threading
import unittest
from unittest.mock import MagicMock, patch

# Ensure a service token is set before importing main, so
# TestClient requests to protected endpoints can authenticate.
os.environ.setdefault("DRIFT_MONITOR_API_TOKEN", "test-token")

import main  # noqa: E402
from main import app  # noqa: E402

from fastapi.testclient import TestClient


class TestDlpLazyInitializer(unittest.TestCase):
    """Prove lazy init, caching, thread-safety and fail-closed behavior."""

    def setUp(self):
        self.client = TestClient(app)
        # Reset singletons between tests
        main._analyzer_instance = None
        main._anonymizer_instance = None
        os.environ["DRIFT_MONITOR_API_TOKEN"] = "test-token"

    def tearDown(self):
        main._analyzer_instance = None
        main._anonymizer_instance = None

    # ------------------------------------------------------------------
    # /health must NOT touch the DLP engine
    # ------------------------------------------------------------------

    def test_health_does_not_initialize_dlp_engine(self):
        """GET /health must be lightweight and never trigger engine init."""
        with patch.object(main, "get_dlp_engines", wraps=main.get_dlp_engines) as spy:
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})
            spy.assert_not_called()

    # ------------------------------------------------------------------
    # Lazy initialization + caching
    # ------------------------------------------------------------------

    @patch("main.AnonymizerEngine")
    @patch("main.AnalyzerEngine")
    def test_lazy_init_creates_engines_on_first_call(self, mock_ae, mock_anon):
        """First call must construct both engines exactly once."""
        mock_analyzer = MagicMock()
        mock_ae.return_value = mock_analyzer
        mock_anonymizer = MagicMock()
        mock_anon.return_value = mock_anonymizer

        analyzer, anonymizer = main.get_dlp_engines()

        mock_ae.assert_called_once()
        mock_anon.assert_called_once()
        self.assertIs(analyzer, mock_analyzer)
        self.assertIs(anonymizer, mock_anonymizer)

    @patch("main.AnonymizerEngine")
    @patch("main.AnalyzerEngine")
    def test_cached_on_subsequent_calls(self, mock_ae, mock_anon):
        """Second call must return the cached instances without re-init."""
        mock_ae.return_value = MagicMock()
        mock_anon.return_value = MagicMock()

        first_a, first_n = main.get_dlp_engines()
        second_a, second_n = main.get_dlp_engines()

        # Constructors called exactly once total
        mock_ae.assert_called_once()
        mock_anon.assert_called_once()
        self.assertIs(first_a, second_a)
        self.assertIs(first_n, second_n)

    # ------------------------------------------------------------------
    # Thread-safety: concurrent calls must not double-initialize
    # ------------------------------------------------------------------

    @patch("main.AnonymizerEngine")
    @patch("main.AnalyzerEngine")
    def test_thread_safe_no_double_init(self, mock_ae, mock_anon):
        """Concurrent callers must not create duplicate engine instances."""
        mock_ae.return_value = MagicMock()
        mock_anon.return_value = MagicMock()

        results = []
        barrier = threading.Barrier(4)

        def call_init():
            barrier.wait()
            try:
                a, n = main.get_dlp_engines()
                results.append((a, n))
            except Exception as exc:
                results.append(exc)

        threads = [threading.Thread(target=call_init) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        # All threads got the same instances
        self.assertEqual(len(results), 4)
        for r in results:
            self.assertNotIsInstance(r, Exception)
        analyzers = {id(r[0]) for r in results}
        anonymizers = {id(r[1]) for r in results}
        self.assertEqual(len(analyzers), 1, "All threads must share one AnalyzerEngine")
        self.assertEqual(len(anonymizers), 1, "All threads must share one AnonymizerEngine")

        # Constructor was called exactly once despite 4 concurrent callers
        mock_ae.assert_called_once()
        mock_anon.assert_called_once()

    # ------------------------------------------------------------------
    # Fail-closed: init failure → RuntimeError, globals stay None, 503
    # ------------------------------------------------------------------

    @patch("main.AnalyzerEngine")
    def test_init_failure_raises_runtime_error(self, mock_ae):
        """If AnalyzerEngine() blows up, we get a sanitized RuntimeError."""
        mock_ae.side_effect = Exception("spaCy model not found")

        with self.assertRaises(RuntimeError) as ctx:
            main.get_dlp_engines()

        # Sanitized message — must NOT contain the raw internal detail
        self.assertIn("NLP engine initialization failed", str(ctx.exception))
        self.assertNotIn("spaCy model not found", str(ctx.exception))

        # Globals remain None so next call will retry
        self.assertIsNone(main._analyzer_instance)
        self.assertIsNone(main._anonymizer_instance)

    @patch("main.AnalyzerEngine")
    def test_init_failure_returns_503_from_endpoint(self, mock_ae):
        """DLP endpoint must fail closed with 503 when engine init fails."""
        mock_ae.side_effect = Exception("model missing")

        response = self.client.post(
            "/api/dlp-scrubber",
            headers={"Authorization": "Bearer test-token"},
            json={"text": "Hello world"},
        )
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertIn("DLP engine is unavailable", body["detail"])
        # Must NOT leak internal exception text
        self.assertNotIn("model missing", body["detail"])

    # ------------------------------------------------------------------
    # No network / download / install during DLP
    # ------------------------------------------------------------------

    @patch("main.AnonymizerEngine")
    @patch("main.AnalyzerEngine")
    def test_no_network_calls_during_dlp(self, mock_ae, mock_anon):
        """DLP scrubbing must not make external requests."""
        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []
        mock_ae.return_value = mock_analyzer
        mock_anon.return_value = MagicMock()

        with patch("requests.post") as mock_req_post, \
             patch("requests.get", side_effect=AssertionError("no GET allowed")):
            response = self.client.post(
                "/api/dlp-scrubber",
                headers={"Authorization": "Bearer test-token"},
                json={"text": "benign text"},
            )
            mock_req_post.assert_not_called()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_compromised"])


class TestStartupValidation(unittest.TestCase):
    """Prove _validate_startup_config logs warnings on missing vars."""

    def _run_validate(self, env_overrides: dict) -> list[str]:
        """Run _validate_startup_config under a controlled environment, capturing log output."""
        records: list[str] = []

        class _CapturingHandler(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                records.append(record.getMessage())

        handler = _CapturingHandler()
        logger = logging.getLogger("guardrail_mesh.drift_monitor")
        logger.addHandler(handler)
        old_level = logger.level
        logger.setLevel(logging.DEBUG)
        try:
            with patch.dict(os.environ, env_overrides, clear=True):
                main._validate_startup_config()
        finally:
            logger.removeHandler(handler)
            logger.setLevel(old_level)
        return records

    def test_warns_when_required_vars_missing(self):
        """Should log a warning listing missing required environment variables."""
        records = self._run_validate({
            "CI": "false",
        })
        combined = " ".join(records)
        self.assertTrue(
            any("missing environment variables" in r for r in records),
            f"Expected warning about missing env vars in logs: {records}",
        )
        self.assertIn("DRIFT_MONITOR_API_TOKEN", combined)
        self.assertIn("DRIFT_WEBHOOK_URL", combined)
        self.assertIn("DRIFT_WEBHOOK_SECRET", combined)

    def test_silent_when_all_required_vars_present(self):
        """Should emit no warnings when all required vars are set."""
        records = self._run_validate({
            "DRIFT_MONITOR_API_TOKEN": "secret-token-value",
            "DRIFT_WEBHOOK_URL": "https://app.example.com/api/webhooks/drift",
            "DRIFT_WEBHOOK_SECRET": "signing-secret-value",
            "SWARM_PROVIDER_BASE_URL": "https://api.openai.com/v1",
            "SWARM_PROVIDER_API_KEY": "sk-test",
            "SWARM_PROVIDER_MODEL": "gpt-4o-mini",
            "CI": "false",
        })
        warning_records = [r for r in records if "missing" in r.lower()]
        self.assertEqual(warning_records, [], f"Unexpected warnings: {warning_records}")

    def test_ci_mode_suppresses_swarm_missing_warning(self):
        """In CI mode, missing SWARM_PROVIDER_* vars should not produce warnings (only info)."""
        records = self._run_validate({
            "DRIFT_MONITOR_API_TOKEN": "token",
            "DRIFT_WEBHOOK_URL": "http://localhost:3000/api/webhooks/drift",
            "DRIFT_WEBHOOK_SECRET": "secret",
            "CI": "true",
        })
        # In CI mode, no warning about swarm provider
        combined = " ".join(records)
        self.assertNotIn("SWARM_PROVIDER_BASE_URL", combined)
        self.assertNotIn("SWARM_PROVIDER_API_KEY", combined)
        self.assertNotIn("SWARM_PROVIDER_MODEL", combined)

    def test_no_secrets_in_log_output(self):
        """Log output must never contain the actual value of a secret."""
        secret_value = "super-secret-token-9991"
        records = self._run_validate({
            "DRIFT_MONITOR_API_TOKEN": secret_value,
            "DRIFT_WEBHOOK_URL": "https://app.example.com/api/webhooks/drift",
            "DRIFT_WEBHOOK_SECRET": "another-secret",
            "CI": "false",
        })
        combined = " ".join(records)
        self.assertNotIn(secret_value, combined, "Secret token appeared in log output!")
        self.assertNotIn("another-secret", combined, "Webhook secret appeared in log output!")

    def test_health_endpoint_not_blocked_when_token_unconfigured(self):
        """GET /health must return 200 even when DRIFT_MONITOR_API_TOKEN is absent."""
        client = TestClient(app)
        with patch.dict(os.environ, {"DRIFT_MONITOR_API_TOKEN": ""}, clear=False):
            response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()

"""Unit tests for services/drift-monitor/swarm.py

Run with: python -m unittest discover -s services/drift-monitor -p "test_*.py"
"""

import os
import unittest
from unittest import mock

import openai

from swarm import (
    SwarmConfigurationError,
    generate_swarm_attack,
    _is_ci_mode,
    _ci_deterministic_payload,
    _CI_DETERMINISTIC_PAYLOADS,
)


class TestCiMode(unittest.TestCase):
    """CI mode detection with exact truth-value parsing."""

    @mock.patch.dict(os.environ, {"CI": "true"}, clear=False)
    def test_ci_true(self):
        self.assertTrue(_is_ci_mode())

    @mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}, clear=False)
    def test_github_actions_true(self):
        self.assertTrue(_is_ci_mode())

    @mock.patch.dict(os.environ, {"CI": "false"}, clear=False)
    def test_ci_false_is_not_ci(self):
        env = os.environ.copy()
        env.pop("GITHUB_ACTIONS", None)
        with mock.patch.dict(os.environ, env, clear=True):
            os.environ["CI"] = "false"
            self.assertFalse(_is_ci_mode())

    @mock.patch.dict(os.environ, {}, clear=True)
    def test_no_env_is_not_ci(self):
        self.assertFalse(_is_ci_mode())

    @mock.patch.dict(os.environ, {"CI": ""}, clear=True)
    def test_empty_ci_is_not_ci(self):
        self.assertFalse(_is_ci_mode())

    @mock.patch.dict(os.environ, {"CI": "1"}, clear=True)
    def test_ci_one_is_not_ci(self):
        self.assertFalse(_is_ci_mode())

    @mock.patch.dict(os.environ, {"CI": "TRUE"}, clear=True)
    def test_ci_true_uppercase(self):
        self.assertTrue(_is_ci_mode())


class TestCiDeterministicPayload(unittest.TestCase):
    """CI mode generates a fixed, realistic payload without network calls."""

    @mock.patch.dict(os.environ, {"CI": "true"}, clear=True)
    @mock.patch("swarm.openai.OpenAI")
    def test_returns_string(self, mock_openai):
        payload = generate_swarm_attack("A helpful AI assistant")
        self.assertIsInstance(payload, str)
        self.assertGreater(len(payload), 50)
        mock_openai.assert_not_called()

    @mock.patch.dict(os.environ, {"CI": "true"}, clear=True)
    @mock.patch("swarm.openai.OpenAI")
    def test_deterministic_same_input(self, mock_openai):
        ctx = "A helpful AI assistant with access to internal tools."
        a = generate_swarm_attack(ctx)
        b = generate_swarm_attack(ctx)
        self.assertEqual(a, b)
        mock_openai.assert_not_called()

    @mock.patch.dict(os.environ, {"CI": "true"}, clear=True)
    def test_payload_is_from_known_set(self):
        ctx = "test target"
        payload = generate_swarm_attack(ctx)
        self.assertIn(payload, _CI_DETERMINISTIC_PAYLOADS)


class TestProductionConfigValidation(unittest.TestCase):
    """Production mode requires explicit provider configuration."""

    @mock.patch.dict(os.environ, {}, clear=True)
    def test_missing_all_raises(self):
        with self.assertRaises(SwarmConfigurationError) as ctx:
            generate_swarm_attack("target")
        msg = str(ctx.exception)
        self.assertIn("SWARM_PROVIDER_BASE_URL", msg)
        self.assertIn("SWARM_PROVIDER_API_KEY", msg)
        self.assertIn("SWARM_PROVIDER_MODEL", msg)

    @mock.patch.dict(
        os.environ,
        {"SWARM_PROVIDER_BASE_URL": "http://provider:8080/v1"},
        clear=True,
    )
    def test_missing_api_key_raises(self):
        with self.assertRaises(SwarmConfigurationError) as ctx:
            generate_swarm_attack("target")
        self.assertIn("SWARM_PROVIDER_API_KEY", str(ctx.exception))

    @mock.patch.dict(
        os.environ,
        {
            "SWARM_PROVIDER_BASE_URL": "http://provider:8080/v1",
            "SWARM_PROVIDER_API_KEY": "sk-test",
            "SWARM_PROVIDER_MODEL": "gpt-4o-mini",
        },
        clear=True,
    )
    @mock.patch("swarm.openai.OpenAI")
    def test_valid_config_creates_client(self, mock_openai):
        # Setup mock to simulate success
        mock_client = mock.MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value.choices = [
            mock.MagicMock(message=mock.MagicMock(content="Mocked response"))
        ]
        
        generate_swarm_attack("target")
        mock_openai.assert_called_once_with(
            base_url="http://provider:8080/v1",
            api_key="sk-test",
            timeout=30,
        )


class TestProviderFailureHandling(unittest.TestCase):
    """Provider failures produce sanitized exceptions."""

    @mock.patch.dict(
        os.environ,
        {
            "SWARM_PROVIDER_BASE_URL": "http://127.0.0.1:19999/v1",
            "SWARM_PROVIDER_API_KEY": "sk-test",
            "SWARM_PROVIDER_MODEL": "test-model",
        },
        clear=True,
    )
    @mock.patch("swarm.openai.OpenAI")
    def test_unreachable_provider_raises_runtime_error(self, mock_openai):
        mock_client = mock.MagicMock()
        mock_openai.return_value = mock_client
        # Simulate network failure from the provider client
        mock_client.chat.completions.create.side_effect = openai.OpenAIError("Connection refused to 127.0.0.1:19999")
        
        with self.assertRaises(RuntimeError) as ctx:
            generate_swarm_attack("target")
            
        msg = str(ctx.exception)
        # Must not leak provider URL or API key
        self.assertNotIn("sk-test", msg)
        self.assertNotIn("19999", msg)
        self.assertNotIn("Connection refused", msg)
        self.assertIn("Swarm provider request failed", msg)

    @mock.patch.dict(
        os.environ,
        {
            "SWARM_PROVIDER_BASE_URL": "http://provider/v1",
            "SWARM_PROVIDER_API_KEY": "sk-test",
            "SWARM_PROVIDER_MODEL": "test-model",
        },
        clear=True,
    )
    @mock.patch("swarm.openai.OpenAI")
    def test_empty_response_raises_runtime_error(self, mock_openai):
        mock_client = mock.MagicMock()
        mock_openai.return_value = mock_client
        # Simulate empty response content
        mock_client.chat.completions.create.return_value.choices = [
            mock.MagicMock(message=mock.MagicMock(content=None))
        ]
        
        with self.assertRaises(RuntimeError) as ctx:
            generate_swarm_attack("target")
            
        self.assertIn("Swarm provider returned an empty response.", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


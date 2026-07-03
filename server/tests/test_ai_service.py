"""Tests for AIService (mocked LLM calls)."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_service import AIService


class TestParseJsonResponse:
    """Tests for the JSON extraction from LLM responses."""

    def setup_method(self):
        self.service = AIService()

    def test_direct_json_array(self):
        text = '[{"module": "M", "feature": "F"}]'
        result = self.service._parse_json_response(text)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["module"] == "M"

    def test_json_in_code_block(self):
        text = '''```json
[
  {"module": "用户管理", "feature": "登录"}
]
```'''
        result = self.service._parse_json_response(text)
        assert isinstance(result, list)
        assert result[0]["module"] == "用户管理"

    def test_json_in_plain_code_block(self):
        text = '''```
[{"module": "M"}]
```'''
        result = self.service._parse_json_response(text)
        assert isinstance(result, list)

    def test_json_with_surrounding_text(self):
        text = '  [{"key": "value"}]  '
        result = self.service._parse_json_response(text)
        assert isinstance(result, list)

    def test_invalid_json_raises_error(self):
        with pytest.raises(json.JSONDecodeError):
            self.service._parse_json_response("not valid json {{{")

    def test_empty_code_block(self):
        with pytest.raises(json.JSONDecodeError):
            self.service._parse_json_response("```\n```")


class TestAIServiceInit:
    def test_init_with_settings(self):
        service = AIService()
        assert hasattr(service, "api_key")
        assert hasattr(service, "base_url")
        assert hasattr(service, "model")


def _run_async(coro):
    """Helper to run async code in synchronous tests."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an already-running loop (e.g. from TestClient)
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


class TestAIServiceLLMCall:
    def test_call_llm_sends_correct_payload(self):
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "test response"}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service._call_llm("system prompt", "user prompt"))

        assert result == "test response"
        mock_client.post.assert_called_once()

        call_args = mock_client.post.call_args
        assert "chat/completions" in call_args[0][0]
        assert call_args[1]["json"]["temperature"] == 0.3
        assert call_args[1]["json"]["max_tokens"] == 4000
        assert len(call_args[1]["json"]["messages"]) == 2

    def test_parse_requirements_calls_llm(self):
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '[{"module": "M", "feature": "F", "source": "", "risk": "中", "rule": "", "question": ""}]'}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.parse_requirements("需求文档内容"))

        assert isinstance(result, list)
        assert result[0]["module"] == "M"

    def test_generate_test_points_calls_llm(self):
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '[{"module": "M", "type": "正常流程", "title": "T", "description": "D", "priority": "P1", "automatable": false}]'}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.generate_test_points("需求文本"))

        assert isinstance(result, list)
        assert result[0]["type"] == "正常流程"

    def test_generate_test_cases_calls_llm(self):
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '[{"caseCode": "TC_001", "module": "M", "title": "T", "priority": "P1", "steps": "1. Step", "expectedResult": "R"}]'}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.generate_test_cases("测试点文本"))

        assert isinstance(result, list)
        assert result[0]["caseCode"] == "TC_001"

    def test_llm_timeout_raises_error(self):
        import httpx
        service = AIService()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.TimeoutException):
                _run_async(service._call_llm("sys", "usr"))

    def test_llm_returns_invalid_json(self):
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "this is not json"}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(json.JSONDecodeError):
                _run_async(service.parse_requirements("content"))

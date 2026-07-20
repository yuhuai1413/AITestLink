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

    def test_invalid_json_returns_empty_list(self):
        """Invalid JSON should return empty list, not raise exception."""
        result = self.service._parse_json_response("not valid json {{{")
        assert result == []

    def test_empty_code_block_returns_empty_list(self):
        """Empty code block should return empty list, not raise exception."""
        result = self.service._parse_json_response("```\n```")
        assert result == []


class TestAIServiceInit:
    def test_init_with_settings(self):
        service = AIService()
        # AIService no longer stores api_key/base_url/model as instance attributes
        # It fetches config from database per-request
        assert service is not None


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
    @patch("app.services.ai_service._get_config_for_task")
    def test_call_llm_sends_correct_payload(self, mock_get_config):
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
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

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service._call_llm("user prompt", "需求解析", "user-1"))

        assert result == "test response"
        mock_client.post.assert_called_once()

        call_args = mock_client.post.call_args
        # The endpoint is the full URL (including /chat/completions if needed)
        assert call_args[0][0] == "https://api.test.com/v1/chat/completions"
        assert call_args[1]["json"]["temperature"] == 0.3
        assert call_args[1]["json"]["max_tokens"] == 16000  # default max_tokens
        assert len(call_args[1]["json"]["messages"]) == 2

    def test_vision_call_sends_image_content_blocks(self):
        from app.services.llm_client import OpenAICompatibleClient

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "图片来源：需求图\n识别内容：登录按钮"}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(OpenAICompatibleClient().complete_with_images(
                endpoint="https://api.test.com/v1",
                api_key="test-key",
                model="vision-model",
                system_prompt="识别图片",
                user_prompt="请识别",
                image_data_urls=["data:image/png;base64,abc"],
                task_type="需求解析",
                max_tokens=8000,
            ))

        assert "登录按钮" in result
        payload = mock_client.post.call_args[1]["json"]
        assert payload["messages"][1]["content"][0] == {"type": "text", "text": "请识别"}
        assert payload["messages"][1]["content"][1]["type"] == "image_url"
        assert payload["messages"][1]["content"][1]["image_url"]["url"] == "data:image/png;base64,abc"

    @patch("app.services.ai_service._get_config_for_task")
    def test_parse_requirements_calls_llm(self, mock_get_config):
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
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

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.parse_requirements("需求文档内容", "user-1"))

        assert isinstance(result, list)
        assert result[0]["module"] == "M"

    @patch("app.services.ai_service._get_config_for_task")
    def test_generate_test_points_calls_llm(self, mock_get_config):
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '[{"requirementId": "req-1", "module": "M", "type": "正常流程", "title": "T", "description": "D", "priority": "P1", "automatable": false}]'}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.generate_test_points("需求文本", "user-1"))

        assert isinstance(result, list)
        assert result[0]["type"] == "正常流程"

    @patch("app.services.ai_service._get_config_for_task")
    def test_generate_test_cases_calls_llm(self, mock_get_config):
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
        service = AIService()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '[{"testPointId": "tp-1", "module": "M", "title": "T", "priority": "P1", "steps": "步骤1: 操作", "expectedResult": "步骤1: 应成功", "environmentId": "env-1", "targetPlatform": "PC", "testUrl": "https://test.example.com", "requiredRole": "无"}]'}}]
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            result = _run_async(service.generate_test_cases("测试点文本", "user-1"))

        assert isinstance(result, list)
        assert result[0]["testPointId"] == "tp-1"

    @patch("app.services.ai_service._get_config_for_task")
    def test_llm_timeout_raises_error(self, mock_get_config):
        import httpx
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
        service = AIService()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.TimeoutException):
                _run_async(service._call_llm("usr", "需求解析", "user-1"))

    @patch("app.services.ai_service._get_config_for_task")
    def test_llm_returns_invalid_json(self, mock_get_config):
        mock_get_config.return_value = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com/v1",
            "model": "test-model",
            "prompt": "You are a software testing assistant."
        }
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

        with patch("app.services.llm_client.httpx.AsyncClient", return_value=mock_client):
            # 非 JSON 或结构不合法的结果必须终止，不能进入写库流程。
            with pytest.raises(ValueError, match="未返回任何数据"):
                _run_async(service.parse_requirements("content", "user-1"))

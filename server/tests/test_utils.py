"""Tests for utility functions."""
from datetime import datetime
from unittest.mock import MagicMock

from app.utils import model_to_dict


class TestModelToDict:
    """Tests for model_to_dict conversion utility."""

    def _make_mock_model(self, columns_data: dict):
        """Helper to create a mock SQLAlchemy model."""
        mock_obj = MagicMock()
        mock_columns = []
        for name, value in columns_data.items():
            col = MagicMock()
            col.name = name
            mock_columns.append(col)
        mock_obj.__table__ = MagicMock()
        mock_obj.__table__.columns = mock_columns

        for name, value in columns_data.items():
            setattr(mock_obj, name, value)

        return mock_obj

    def test_snake_case_to_camel_case(self):
        """Verify snake_case column names are converted to camelCase."""
        obj = self._make_mock_model({
            "project_id": "proj-123",
            "test_type": "功能测试",
            "case_count": 5,
            "risk_level": "高",
        })
        result = model_to_dict(obj)
        assert result["projectId"] == "proj-123"
        assert result["testType"] == "功能测试"
        assert result["caseCount"] == 5
        assert result["riskLevel"] == "高"

    def test_single_word_columns_unchanged(self):
        """Single-word column names should remain lowercase."""
        obj = self._make_mock_model({
            "name": "测试项目",
            "status": "设计中",
        })
        result = model_to_dict(obj)
        assert result["name"] == "测试项目"
        assert result["status"] == "设计中"

    def test_datetime_converted_to_iso(self):
        """Datetime values should be converted to ISO format strings with timezone."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        obj = self._make_mock_model({"created_at": dt})
        result = model_to_dict(obj)
        # datetime without timezone gets UTC timezone added, so format includes +00:00
        assert result["createdAt"] == "2025-01-15T10:30:00+00:00"

    def test_uuid_converted_to_string(self):
        """UUID-like values (with .hex attribute) should be stringified."""
        from uuid import UUID
        uid = UUID("12345678-1234-5678-1234-567812345678")
        obj = self._make_mock_model({"id": uid})
        result = model_to_dict(obj)
        assert result["id"] == "12345678-1234-5678-1234-567812345678"

    def test_none_values_preserved(self):
        """None values should be preserved in output."""
        obj = self._make_mock_model({"error_message": None, "name": "test"})
        result = model_to_dict(obj)
        assert result["errorMessage"] is None
        assert result["name"] == "test"

    def test_boolean_values_preserved(self):
        """Boolean values should be preserved as-is."""
        obj = self._make_mock_model({"confirmed": True, "automatable": False})
        result = model_to_dict(obj)
        assert result["confirmed"] is True
        assert result["automatable"] is False

    def test_integer_values_preserved(self):
        """Integer values should be preserved as-is."""
        obj = self._make_mock_model({"size": 1024, "pass_rate": 95})
        result = model_to_dict(obj)
        assert result["size"] == 1024
        assert result["passRate"] == 95

    def test_empty_dict_for_no_columns(self):
        """Model with no columns should return empty dict."""
        obj = self._make_mock_model({})
        result = model_to_dict(obj)
        assert result == {}

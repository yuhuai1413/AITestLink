"""Tests for AI API endpoints."""
from unittest.mock import patch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def test_list_ai_tasks(client, api_project):
    response = client.get(f"/api/projects/{api_project.id}/ai/tasks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_parse_requirements_no_files(client, api_project):
    """Should return error when no files are uploaded."""
    response = client.post(f"/api/projects/{api_project.id}/ai/parse-requirements")
    assert response.status_code == 200
    data = response.json()
    assert "error" in data


def test_generate_test_points_creates_task(client, api_project, async_engine, event_loop):
    """Should create an AI task with '执行中' status."""
    sf = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    with patch("app.database.async_session", sf):
        response = client.post(f"/api/projects/{api_project.id}/ai/generate-test-points")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "测试点生成"
    assert data["status"] == "执行中"
    assert "id" in data


def test_generate_test_cases_creates_task(client, api_project, async_engine, event_loop):
    """Should create an AI task with '执行中' status."""
    sf = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    with patch("app.database.async_session", sf):
        response = client.post(f"/api/projects/{api_project.id}/ai/generate-test-cases")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "用例生成"
    assert data["status"] == "执行中"


def test_ai_tasks_ordered_by_created_at(client, api_project, async_engine, event_loop):
    """AI tasks should be returned in descending order of creation."""
    sf = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    with patch("app.database.async_session", sf):
        client.post(f"/api/projects/{api_project.id}/ai/generate-test-points")
        client.post(f"/api/projects/{api_project.id}/ai/generate-test-cases")

    response = client.get(f"/api/projects/{api_project.id}/ai/tasks")
    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) >= 2
    assert tasks[0]["createdAt"] >= tasks[-1]["createdAt"]

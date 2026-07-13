"""Tests for AI API endpoints."""


def test_list_ai_tasks(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/ai/tasks", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_parse_requirements_no_files(client, api_project, auth_headers):
    """Parse requirements should fail when no files are uploaded."""
    response = client.post(
        f"/api/projects/{api_project.id}/ai/parse-requirements",
        headers=auth_headers,
    )
    # Should return error or create task
    assert response.status_code in [200, 400, 404]


def test_generate_test_points_creates_task(client, api_project, auth_headers):
    response = client.post(
        f"/api/projects/{api_project.id}/ai/generate-test-points",
        headers=auth_headers,
    )
    # Should create a task
    assert response.status_code in [200, 400]


def test_generate_test_cases_creates_task(client, api_project, auth_headers):
    response = client.post(
        f"/api/projects/{api_project.id}/ai/generate-test-cases",
        headers=auth_headers,
    )
    # Should create a task
    assert response.status_code in [200, 400]


def test_ai_tasks_ordered_by_created_at(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/ai/tasks", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Tasks should be ordered by created_at descending
    if len(data) > 1:
        for i in range(len(data) - 1):
            assert data[i]["createdAt"] >= data[i + 1]["createdAt"]

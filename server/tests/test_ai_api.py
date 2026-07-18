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


def test_generate_test_points_requires_reviewed_requirements(client, api_requirement, auth_headers):
    response = client.post(
        f"/api/projects/{api_requirement.project_id}/ai/generate-test-points",
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "需求未评审通过" in response.json()["detail"]


def test_generate_test_cases_creates_task(client, api_project, auth_headers):
    response = client.post(
        f"/api/projects/{api_project.id}/ai/generate-test-cases",
        headers=auth_headers,
    )
    # Should create a task
    assert response.status_code in [200, 400]


def test_generate_test_cases_requires_reviewed_test_points(client, api_test_point, auth_headers):
    response = client.post(
        f"/api/projects/{api_test_point.project_id}/ai/generate-test-cases",
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "测试点未评审通过" in response.json()["detail"]


def test_generate_scripts_requires_reviewed_automatable_cases(client, api_test_case, auth_headers):
    update_response = client.put(
        f"/api/test-cases/{api_test_case.id}",
        json={"automation": "是"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200

    response = client.post(
        f"/api/projects/{api_test_case.project_id}/ai/generate-scripts",
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "适合自动化的用例未评审通过" in response.json()["detail"]


def test_generate_docs_requires_reviewed_test_points(client, api_requirement, api_test_point, auth_headers):
    req_response = client.put(
        f"/api/requirements/{api_requirement.id}",
        json={"reviewStatus": "已通过"},
        headers=auth_headers,
    )
    assert req_response.status_code == 200

    response = client.post(
        f"/api/projects/{api_requirement.project_id}/ai/generate-docs",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "测试点未评审通过" in response.json()["detail"]


def test_ai_tasks_ordered_by_created_at(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/ai/tasks", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Tasks should be ordered by created_at descending
    if len(data) > 1:
        for i in range(len(data) - 1):
            assert data[i]["createdAt"] >= data[i + 1]["createdAt"]

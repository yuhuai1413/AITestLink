"""Tests for Requirements API endpoints."""


def test_list_requirements(client, api_requirement, auth_headers):
    response = client.get(f"/api/projects/{api_requirement.project_id}/requirements", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_list_requirements_empty(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/requirements", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_update_requirement(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "rule": "新的业务规则",
        "question": "待确认的问题",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["rule"] == "新的业务规则"
    assert data["question"] == "待确认的问题"


def test_update_requirement_confirmed_only(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "confirmed": True,
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["confirmed"] is True


def test_update_requirement_not_found(client, auth_headers):
    response = client.put("/api/requirements/nonexistent", json={"rule": "X"}, headers=auth_headers)
    assert response.status_code == 404


def test_requirements_filtered_by_project(client, api_project, api_requirement, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/requirements", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert all(r["projectId"] == api_project.id for r in data)

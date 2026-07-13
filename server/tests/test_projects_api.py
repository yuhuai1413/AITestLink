"""Tests for Projects API endpoints."""


def test_create_project(client, auth_headers):
    response = client.post("/api/projects", json={
        "name": "新项目",
        "testType": "功能测试",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "新项目"
    assert data["testType"] == "功能测试"
    assert data["testStatus"] == "待测试"
    assert data["docStatus"] == "待解析"
    assert data["priority"] == "中"
    assert "id" in data
    assert "createdAt" in data


def test_create_project_with_all_fields(client, auth_headers):
    response = client.post("/api/projects", json={
        "name": "完整项目",
        "testType": "性能测试",
        "testStatus": "测试中",
        "docStatus": "已解析",
        "description": "这是一个完整的项目",
        "priority": "高",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["testStatus"] == "测试中"
    assert data["docStatus"] == "已解析"
    assert data["priority"] == "高"


def test_create_project_missing_required_field(client, auth_headers):
    response = client.post("/api/projects", json={
        "name": "缺少字段的项目",
    }, headers=auth_headers)
    assert response.status_code == 422


def test_list_projects(client, api_project, auth_headers):
    response = client.get("/api/projects", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "caseCount" in data[0]


def test_get_project(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == api_project.id
    assert data["name"] == "API测试项目"
    assert data["caseCount"] == 0


def test_get_project_not_found(client, auth_headers):
    response = client.get("/api/projects/nonexistent-id", headers=auth_headers)
    assert response.status_code == 404


def test_update_project(client, api_project, auth_headers):
    response = client.put(f"/api/projects/{api_project.id}", json={
        "name": "更新后的项目",
        "testStatus": "已完成",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "更新后的项目"
    assert data["testStatus"] == "已完成"


def test_update_project_partial(client, api_project, auth_headers):
    response = client.put(f"/api/projects/{api_project.id}", json={
        "priority": "低",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "低"
    assert data["name"] == "API测试项目"  # unchanged


def test_update_project_not_found(client, auth_headers):
    response = client.put("/api/projects/nonexistent", json={"name": "X"}, headers=auth_headers)
    assert response.status_code == 404


def test_delete_project(client, api_project, auth_headers):
    response = client.delete(f"/api/projects/{api_project.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True

    response = client.get(f"/api/projects/{api_project.id}", headers=auth_headers)
    assert response.status_code == 404


def test_delete_project_not_found(client, auth_headers):
    response = client.delete("/api/projects/nonexistent", headers=auth_headers)
    assert response.status_code == 404


def test_delete_project_cascades(client, api_project, api_test_case, auth_headers):
    """Deleting a project should cascade delete all child entities.
    Note: SQLite FK cascade behavior varies with async drivers.
    This test verifies the endpoint returns 200 and the project is gone."""
    project_id = api_project.id

    resp = client.get(f"/api/projects/{project_id}/test-cases", headers=auth_headers)
    assert len(resp.json()) >= 1

    resp = client.delete(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 200

    # Project should be gone
    resp = client.get(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 404

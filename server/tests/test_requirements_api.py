"""Tests for Requirements API endpoints."""


def test_list_requirements(client, api_project, api_requirement):
    response = client.get(f"/api/projects/{api_project.id}/requirements")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["module"] == "用户管理"
    assert data[0]["feature"] == "登录功能"


def test_list_requirements_empty(client, api_project):
    response = client.get(f"/api/projects/{api_project.id}/requirements")
    assert response.status_code == 200
    assert response.json() == []


def test_update_requirement(client, api_project, api_requirement):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "confirmed": True,
        "rule": "更新后的规则",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["confirmed"] is True
    assert data["rule"] == "更新后的规则"
    assert data["module"] == "用户管理"  # unchanged


def test_update_requirement_confirmed_only(client, api_requirement):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "confirmed": True,
    })
    assert response.status_code == 200
    assert response.json()["confirmed"] is True
    assert response.json()["question"] == ""  # unchanged


def test_update_requirement_not_found(client):
    response = client.put("/api/requirements/nonexistent", json={"confirmed": True})
    assert response.status_code == 404


def test_requirements_filtered_by_project(client, api_project, api_requirement):
    resp = client.post("/api/projects", json={
        "name": "另一项目", "owner": "李四", "testType": "功能测试",
    })
    response = client.get(f"/api/projects/{api_project.id}/requirements")
    for req in response.json():
        assert req["projectId"] == api_project.id

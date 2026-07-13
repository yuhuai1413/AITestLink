"""Tests for Test Points API endpoints."""


def test_list_test_points(client, api_test_point, auth_headers):
    response = client.get(f"/api/projects/{api_test_point.project_id}/test-points", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_list_test_points_empty(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/test-points", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_test_point(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "用户管理",
        "type": "正常流程",
        "title": "测试登录功能",
        "priority": "P0",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["module"] == "用户管理"
    assert data["type"] == "正常流程"
    assert data["title"] == "测试登录功能"
    assert data["priority"] == "P0"


def test_create_test_point_defaults(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "M",
        "type": "正常流程",
        "title": "T",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["priority"] == "P1"
    assert data["automatable"] is False
    assert data["reviewStatus"] == "待评审"


def test_create_test_point_missing_fields(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "M",
    }, headers=auth_headers)
    assert response.status_code == 422


def test_update_test_point(client, api_test_point, auth_headers):
    response = client.put(f"/api/test-points/{api_test_point.id}", json={
        "title": "更新后的测试点",
        "priority": "P0",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "更新后的测试点"
    assert data["priority"] == "P0"


def test_update_test_point_partial(client, api_test_point, auth_headers):
    response = client.put(f"/api/test-points/{api_test_point.id}", json={
        "priority": "P2",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "P2"
    assert data["title"] == "测试登录"  # unchanged


def test_update_test_point_not_found(client, auth_headers):
    response = client.put("/api/test-points/nonexistent", json={"title": "X"}, headers=auth_headers)
    assert response.status_code == 404


def test_delete_test_point(client, api_test_point, auth_headers):
    response = client.delete(f"/api/test-points/{api_test_point.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_delete_test_point_not_found(client, auth_headers):
    response = client.delete("/api/test-points/nonexistent", headers=auth_headers)
    assert response.status_code == 404


def test_test_point_all_types(client, api_project, auth_headers):
    """All 6 test point types should be accepted."""
    for tp_type in ["正常流程", "异常流程", "边界值", "权限控制", "数据一致性", "状态流转"]:
        response = client.post(f"/api/projects/{api_project.id}/test-points", json={
            "module": "M", "type": tp_type, "title": f"测试{tp_type}",
        }, headers=auth_headers)
        assert response.status_code == 201
        assert response.json()["type"] == tp_type

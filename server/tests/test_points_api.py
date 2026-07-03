"""Tests for Test Points API endpoints."""


def test_list_test_points(client, api_project, api_test_point):
    response = client.get(f"/api/projects/{api_project.id}/test-points")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["title"] == "测试登录"


def test_list_test_points_empty(client, api_project):
    response = client.get(f"/api/projects/{api_project.id}/test-points")
    assert response.status_code == 200
    assert response.json() == []


def test_create_test_point(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "订单管理",
        "type": "边界值",
        "title": "验证订单金额边界",
        "description": "测试订单金额为0和最大值的情况",
        "priority": "P0",
        "automatable": True,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["module"] == "订单管理"
    assert data["type"] == "边界值"
    assert data["priority"] == "P0"
    assert data["automatable"] is True
    assert data["reviewStatus"] == "待评审"
    assert data["projectId"] == api_project.id


def test_create_test_point_defaults(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "M", "type": "正常流程", "title": "T",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["priority"] == "P1"
    assert data["automatable"] is False
    assert data["description"] == ""


def test_create_test_point_missing_fields(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-points", json={
        "module": "M",
    })
    assert response.status_code == 422


def test_update_test_point(client, api_test_point):
    response = client.put(f"/api/test-points/{api_test_point.id}", json={
        "title": "更新后的标题",
        "priority": "P0",
        "reviewStatus": "已评审",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "更新后的标题"
    assert data["priority"] == "P0"
    assert data["reviewStatus"] == "已评审"


def test_update_test_point_partial(client, api_test_point):
    response = client.put(f"/api/test-points/{api_test_point.id}", json={
        "description": "只更新描述",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "只更新描述"
    assert data["title"] == "测试登录"  # unchanged


def test_update_test_point_not_found(client):
    response = client.put("/api/test-points/nonexistent", json={"title": "X"})
    assert response.status_code == 404


def test_delete_test_point(client, api_test_point):
    response = client.delete(f"/api/test-points/{api_test_point.id}")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_delete_test_point_not_found(client):
    response = client.delete("/api/test-points/nonexistent")
    assert response.status_code == 404


def test_test_point_all_types(client, api_project):
    """All 6 test point types should be accepted."""
    types = ["正常流程", "异常流程", "边界值", "权限控制", "数据一致性", "状态流转"]
    for tp_type in types:
        response = client.post(f"/api/projects/{api_project.id}/test-points", json={
            "module": "M", "type": tp_type, "title": f"测试{tp_type}",
        })
        assert response.status_code == 201
        assert response.json()["type"] == tp_type

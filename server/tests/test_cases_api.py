"""Tests for Test Cases API endpoints."""


def test_list_test_cases(client, api_project, api_test_case):
    response = client.get(f"/api/projects/{api_project.id}/test-cases")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["caseCode"] == "TC_LOGIN_001"


def test_list_test_cases_empty(client, api_project):
    response = client.get(f"/api/projects/{api_project.id}/test-cases")
    assert response.status_code == 200
    assert response.json() == []


def test_create_test_case(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_ORDER_001",
        "module": "订单管理",
        "feature": "下单功能",
        "title": "验证正常下单流程",
        "priority": "P0",
        "precondition": "用户已登录",
        "steps": "1. 选择商品\n2. 点击下单\n3. 确认支付",
        "testData": "商品A x1",
        "expectedResult": "订单创建成功",
        "automation": "适合",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["caseCode"] == "TC_ORDER_001"
    assert data["module"] == "订单管理"
    assert data["priority"] == "P0"
    assert data["projectId"] == api_project.id


def test_create_test_case_defaults(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_001", "module": "M", "title": "T",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["automation"] == "待评估"
    assert data["reviewStatus"] == "待评审"
    assert data["feature"] == ""
    assert data["precondition"] == ""


def test_create_test_case_with_references(client, api_project, api_test_point, api_requirement):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_REF_001",
        "module": "M",
        "title": "带引用的用例",
        "testPointId": api_test_point.id,
        "requirementId": api_requirement.id,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["testPointId"] == api_test_point.id
    assert data["requirementId"] == api_requirement.id


def test_create_test_case_missing_fields(client, api_project):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "module": "M", "title": "T",
    })
    assert response.status_code == 422


def test_update_test_case(client, api_test_case):
    response = client.put(f"/api/test-cases/{api_test_case.id}", json={
        "title": "更新后的用例标题",
        "priority": "P0",
        "reviewStatus": "已通过",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "更新后的用例标题"
    assert data["priority"] == "P0"
    assert data["reviewStatus"] == "已通过"


def test_update_test_case_partial(client, api_test_case):
    response = client.put(f"/api/test-cases/{api_test_case.id}", json={
        "remark": "只更新备注",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["remark"] == "只更新备注"
    assert data["title"] == "验证登录"  # unchanged


def test_update_test_case_not_found(client):
    response = client.put("/api/test-cases/nonexistent", json={"title": "X"})
    assert response.status_code == 404


def test_delete_test_case(client, api_test_case):
    response = client.delete(f"/api/test-cases/{api_test_case.id}")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_delete_test_case_not_found(client):
    response = client.delete("/api/test-cases/nonexistent")
    assert response.status_code == 404


def test_test_cases_filtered_by_project(client, api_project, api_test_case):
    resp = client.post("/api/projects", json={
        "name": "另一项目", "owner": "李四", "testType": "功能测试",
    })
    response = client.get(f"/api/projects/{api_project.id}/test-cases")
    for tc in response.json():
        assert tc["projectId"] == api_project.id

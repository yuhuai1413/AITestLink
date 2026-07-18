"""Tests for Test Cases API endpoints."""
from io import BytesIO


def test_list_test_cases(client, api_test_case, auth_headers):
    response = client.get(f"/api/projects/{api_test_case.project_id}/test-cases", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_list_test_cases_empty(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/test-cases", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_test_case(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_001",
        "module": "用户管理",
        "title": "测试登录功能",
        "priority": "P0",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["caseCode"] == "TC_001"
    assert data["module"] == "用户管理"
    assert data["title"] == "测试登录功能"
    assert data["priority"] == "P0"


def test_create_test_case_defaults(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_002",
        "module": "M",
        "title": "T",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["priority"] == "P1"
    assert data["automation"] == "待评估"
    assert data["reviewStatus"] == "待评审"


def test_create_test_case_with_references(client, api_project, api_test_point, api_requirement, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "caseCode": "TC_003",
        "module": "M",
        "title": "T",
        "testPointId": api_test_point.id,
        "requirementId": api_requirement.id,
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["testPointId"] == api_test_point.id
    assert data["requirementId"] == api_requirement.id


def test_create_test_case_missing_fields(client, api_project, auth_headers):
    response = client.post(f"/api/projects/{api_project.id}/test-cases", json={
        "module": "M",
        "title": "T",
    }, headers=auth_headers)
    assert response.status_code == 422


def test_update_test_case(client, api_test_case, auth_headers):
    response = client.put(f"/api/test-cases/{api_test_case.id}", json={
        "title": "更新后的测试用例",
        "priority": "P0",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "更新后的测试用例"
    assert data["priority"] == "P0"


def test_update_test_case_partial(client, api_test_case, auth_headers):
    response = client.put(f"/api/test-cases/{api_test_case.id}", json={
        "priority": "P2",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "P2"
    assert data["title"] == "验证登录"  # unchanged


def test_update_test_case_not_found(client, auth_headers):
    response = client.put("/api/test-cases/nonexistent", json={"title": "X"}, headers=auth_headers)
    assert response.status_code == 404


def test_delete_test_case_forbidden(client, api_test_case, auth_headers):
    response = client.delete(f"/api/test-cases/{api_test_case.id}", headers=auth_headers)
    assert response.status_code == 400
    assert "不允许单独删除" in response.json()["detail"]


def test_test_cases_filtered_by_project(client, api_project, api_test_case, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/test-cases", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert all(tc["projectId"] == api_project.id for tc in data)


def test_export_test_cases_xlsx_has_readable_table_style(client, api_test_case, auth_headers):
    response = client.get(f"/api/projects/{api_test_case.project_id}/test-cases/export?type=all", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    from openpyxl import load_workbook

    workbook = load_workbook(BytesIO(response.content))
    sheet = workbook["测试用例"]
    assert sheet["A1"].value == "API测试项目 - 全部测试用例"
    assert sheet["A3"].value == "序号"
    assert sheet["B3"].value == "用例编号"
    assert sheet["L3"].value == "测试步骤"
    assert sheet["A4"].alignment.horizontal == "center"
    assert sheet["L4"].alignment.wrap_text is True
    assert sheet["L4"].alignment.vertical == "center"
    assert sheet.freeze_panes == "A4"
    assert sheet.auto_filter.ref.startswith("A3:")

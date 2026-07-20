"""Tests for Requirements API endpoints."""
from io import BytesIO


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
    assert data["clarificationStatus"] == "待确认"


def test_update_requirement_confirmed_only(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "confirmed": True,
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["confirmed"] is True
    assert data["clarificationStatus"] in ("已确认", "无需确认")


def test_review_blocks_unresolved_clarification(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "question": "请确认部门需求是否只覆盖销售部",
    }, headers=auth_headers)
    assert response.status_code == 200

    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "reviewStatus": "已通过",
    }, headers=auth_headers)
    assert response.status_code == 400
    assert "待确认问题未处理" in response.json()["detail"]


def test_review_allows_confirmed_clarification(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "question": "请确认部门需求是否只覆盖销售部",
        "clarificationAnswer": "本次只覆盖销售部，其他部门不纳入本轮测试。",
        "reviewStatus": "已通过",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["reviewStatus"] == "已通过"
    assert data["clarificationStatus"] == "已确认"
    assert data["confirmed"] is True


def test_manual_status_is_ignored_when_question_has_no_answer(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "question": "请确认部门需求是否只覆盖销售部",
        "clarificationStatus": "无需确认",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["clarificationStatus"] == "待确认"
    assert data["confirmed"] is False


def test_manual_status_is_ignored_when_answer_exists(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "question": "请确认部门需求是否只覆盖销售部",
        "clarificationStatus": "无需确认",
        "clarificationAnswer": "该问题不影响本轮测试范围，按现有需求继续覆盖销售部。",
        "reviewStatus": "已通过",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["clarificationStatus"] == "已确认"
    assert data["reviewStatus"] == "已通过"


def test_auxiliary_doc_question_does_not_block_review(client, api_requirement, auth_headers):
    response = client.put(f"/api/requirements/{api_requirement.id}", json={
        "question": "【辅助文档信息】测试账号：admin",
        "reviewStatus": "已通过",
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["reviewStatus"] == "已通过"
    assert data["clarificationStatus"] == "无需确认"


def test_update_requirement_not_found(client, auth_headers):
    response = client.put("/api/requirements/nonexistent", json={"rule": "X"}, headers=auth_headers)
    assert response.status_code == 404


def test_delete_requirement_forbidden(client, api_requirement, auth_headers):
    response = client.delete(f"/api/requirements/{api_requirement.id}", headers=auth_headers)
    assert response.status_code == 400
    assert "不允许单独删除" in response.json()["detail"]


def test_requirements_filtered_by_project(client, api_project, api_requirement, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/requirements", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert all(r["projectId"] == api_project.id for r in data)


def test_export_requirements_xlsx_has_readable_table_style(client, api_requirement, auth_headers):
    response = client.get(f"/api/projects/{api_requirement.project_id}/requirements/export", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    from openpyxl import load_workbook

    workbook = load_workbook(BytesIO(response.content))
    sheet = workbook["需求列表"]
    assert sheet["A1"].value == "API测试项目 - 需求列表"
    assert sheet["A3"].value == "序号"
    assert sheet["B3"].value == "需求编号"
    assert sheet["G3"].value == "业务规则"
    assert sheet["A4"].alignment.horizontal == "center"
    assert sheet["G4"].alignment.wrap_text is True
    assert sheet["G4"].alignment.vertical == "center"
    assert "T" not in sheet["N4"].value
    assert "+00:00" not in sheet["N4"].value
    assert len(sheet["N4"].value) == 19
    assert sheet.freeze_panes == "A4"
    assert sheet.auto_filter.ref.startswith("A3:")

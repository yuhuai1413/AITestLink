"""Environment configuration API security and ownership tests."""


def test_environment_account_password_is_never_returned(client, api_project, auth_headers):
    environment_response = client.post(
        f"/api/projects/{api_project.id}/environments",
        json={"name": "测试环境", "webUrl": "https://example.test", "appUrl": "app://test-build"},
        headers=auth_headers,
    )
    assert environment_response.status_code == 200
    environment = environment_response.json()
    assert environment["appUrl"] == "app://test-build"
    assert environment["isDefault"] is True
    assert "apiUrl" not in environment

    account_response = client.post(
        f"/api/environments/{environment['id']}/accounts",
        json={
            "environmentId": environment["id"],
            "name": "管理员",
            "username": "admin",
            "department": "质量部",
            "password": "super-secret",
        },
        headers=auth_headers,
    )
    assert account_response.status_code == 200
    account = account_response.json()
    assert account["department"] == "质量部"
    assert account["password"] == ""
    assert account["hasPassword"] is True
    assert "super-secret" not in account_response.text

    list_response = client.get(
        f"/api/projects/{api_project.id}/environments",
        headers=auth_headers,
    )
    assert list_response.status_code == 200
    listed_account = list_response.json()[0]["accounts"][0]
    assert listed_account["department"] == "质量部"
    assert listed_account["password"] == ""
    assert listed_account["hasPassword"] is True
    assert "super-secret" not in list_response.text


def test_environment_requires_project_owner(client, auth_headers):
    response = client.get(
        "/api/projects/not-owned/environments",
        headers=auth_headers,
    )
    assert response.status_code == 404

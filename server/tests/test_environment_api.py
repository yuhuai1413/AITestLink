"""Environment configuration API security and ownership tests."""


def test_environment_account_password_is_never_returned(client, api_project, auth_headers):
    environment_response = client.post(
        f"/api/projects/{api_project.id}/environments",
        json={
            "name": "测试环境",
            "environmentType": "Web",
            "webUrl": "https://example.test",
            "captchaRequired": False,
            "captchaCode": "0000",
        },
        headers=auth_headers,
    )
    assert environment_response.status_code == 200
    environment = environment_response.json()
    assert environment["environmentType"] == "Web"
    assert environment["webUrl"] == "https://example.test"
    assert environment["appUrl"] == ""
    assert environment["isDefault"] is True
    assert environment["captchaRequired"] is False
    assert environment["captchaCode"] == "0000"
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
    listed_environment = list_response.json()[0]
    assert listed_environment["captchaRequired"] is False
    assert listed_environment["captchaCode"] == "0000"
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


def test_app_environment_can_keep_captcha_strategy(client, api_project, auth_headers):
    response = client.post(
        f"/api/projects/{api_project.id}/environments",
        json={
            "name": "APP 测试环境",
            "environmentType": "APP",
            "appUrl": "app://test-build",
            "captchaRequired": True,
            "captchaCode": "1234",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    environment = response.json()
    assert environment["environmentType"] == "APP"
    assert environment["webUrl"] == ""
    assert environment["appUrl"] == "app://test-build"
    assert environment["captchaRequired"] is True
    assert environment["captchaCode"] == "1234"

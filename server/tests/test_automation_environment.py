def test_execution_options_use_bound_environment_without_password(
    client, api_script, api_test_account, api_environment, auth_headers
):
    response = client.get(
        f"/api/scripts/{api_script.id}/execution-options", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["boundEnvironmentId"] == api_environment.id
    assert data["targetPlatform"] == "PC"
    assert data["testUrl"] == api_environment.web_url
    assert data["requiredRole"] == "管理员"
    assert data["environments"][0]["captchaRequired"] is False
    assert data["environments"][0]["captchaCode"] == "0000"
    account = data["environments"][0]["accounts"][0]
    assert account["id"] == api_test_account.id
    assert account["password"] == ""
    assert "dummy" not in response.text


def test_execute_rejects_environment_not_bound_to_case(
    client, api_script, api_test_account, auth_headers
):
    response = client.post(
        f"/api/scripts/{api_script.id}/execute",
        json={"environmentId": "another-env", "accountId": api_test_account.id},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "测试地址不一致" in response.text


def test_execute_records_result_and_sanitized_snapshot(
    client, api_script, api_test_account, api_environment, auth_headers
):
    response = client.post(
        f"/api/scripts/{api_script.id}/execute",
        json={"environmentId": api_environment.id, "accountId": api_test_account.id, "headed": True, "slowMo": 500},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "executionRunId" in response.text
    assert "dummy" not in response.text
    data = response.json()
    assert data["status"] == "通过"
    assert data["scriptId"] == api_script.id

    history = client.get(
        f"/api/scripts/{api_script.id}/executions", headers=auth_headers
    )
    assert history.status_code == 200
    record = history.json()[0]
    assert record["status"] == "通过"
    assert api_environment.web_url in record["environmentSnapshot"]
    assert '"captchaRequired": false' in record["environmentSnapshot"]
    assert '"hasCaptchaCode": true' in record["environmentSnapshot"]
    assert "0000" not in record["environmentSnapshot"]
    assert "password" not in record["environmentSnapshot"].lower()

"""Tests for Files API endpoints."""
import io


def test_list_files_empty(client, api_project, auth_headers):
    response = client.get(f"/api/projects/{api_project.id}/files", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_upload_file(client, api_project, auth_headers):
    file_content = b"test file content"
    response = client.post(
        f"/api/projects/{api_project.id}/files",
        files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "test.txt"
    # fileType returns the file extension
    assert data["fileType"] == "txt"


def test_list_files_after_upload(client, api_project, auth_headers):
    # Upload a file first
    file_content = b"test file content"
    client.post(
        f"/api/projects/{api_project.id}/files",
        files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
        headers=auth_headers,
    )

    # List files
    response = client.get(f"/api/projects/{api_project.id}/files", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


def test_delete_file(client, api_project, auth_headers):
    # Upload a file first
    file_content = b"test file content"
    upload_response = client.post(
        f"/api/projects/{api_project.id}/files",
        files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
        headers=auth_headers,
    )
    file_id = upload_response.json()["id"]

    # Delete the file
    response = client.delete(f"/api/files/{file_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_delete_file_not_found(client, auth_headers):
    response = client.delete("/api/files/nonexistent", headers=auth_headers)
    assert response.status_code == 404


def test_file_type_detection(client, api_project, auth_headers):
    # Upload a PDF-like file
    file_content = b"%PDF-1.4 fake content"
    response = client.post(
        f"/api/projects/{api_project.id}/files",
        files={"file": ("document.pdf", io.BytesIO(file_content), "application/pdf")},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    # fileType returns the file extension
    assert data["fileType"] == "pdf"


def test_upload_to_nonexistent_project(client, auth_headers):
    file_content = b"test file content"
    response = client.post(
        "/api/projects/nonexistent/files",
        files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
        headers=auth_headers,
    )
    assert response.status_code == 404

import zipfile
from pathlib import Path

from app.models.file_asset import FileAsset
from app.services.document_vision_service import extract_document_images


PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000a49444154789c636000000200015d0b2a0000000000"
    "49454e44ae426082"
)


def _file_asset(path: Path, name: str) -> FileAsset:
    return FileAsset(id="f-1", project_id="p-1", name=name, file_type=name.rsplit(".", 1)[-1], storage_path=str(path))


def test_extract_direct_image_file(tmp_path):
    image_path = tmp_path / "prototype.png"
    image_path.write_bytes(PNG_BYTES)

    images = extract_document_images([_file_asset(image_path, "prototype.png")])

    assert len(images) == 1
    assert images[0].source == "prototype.png - 原始图片"
    assert images[0].extension == "png"
    assert images[0].data == PNG_BYTES


def test_extract_docx_embedded_images(tmp_path):
    docx_path = tmp_path / "需求文档.docx"
    with zipfile.ZipFile(docx_path, "w") as archive:
        archive.writestr("word/document.xml", "<w:document />")
        archive.writestr("word/media/image1.png", PNG_BYTES)

    images = extract_document_images([_file_asset(docx_path, "需求文档.docx")])

    assert len(images) == 1
    assert images[0].source == "需求文档.docx - 图片1"
    assert images[0].data == PNG_BYTES

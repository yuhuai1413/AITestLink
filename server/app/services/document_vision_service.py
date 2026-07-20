from __future__ import annotations

import base64
import io
import logging
import os
import zipfile
from dataclasses import dataclass

import httpx

from app.models.file_asset import FileAsset
from app.services.ai_service import _get_config_for_task, _is_config_level_failure, _mark_config_status
from app.services.llm_client import OpenAICompatibleClient

logger = logging.getLogger(__name__)

MAX_IMAGES_PER_PROJECT = 24
MAX_IMAGE_BYTES = 4 * 1024 * 1024
SUPPORTED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}


@dataclass
class DocumentImage:
    source: str
    extension: str
    data: bytes


def _file_extension(path_or_name: str) -> str:
    return path_or_name.rsplit(".", 1)[-1].lower() if "." in path_or_name else ""


def _mime_type(extension: str) -> str:
    ext = extension.lower()
    if ext in {"jpg", "jpeg"}:
        return "image/jpeg"
    if ext == "webp":
        return "image/webp"
    if ext == "gif":
        return "image/gif"
    if ext == "bmp":
        return "image/bmp"
    return "image/png"


def _data_url(image: DocumentImage) -> str:
    encoded = base64.b64encode(image.data).decode()
    return f"data:{_mime_type(image.extension)};base64,{encoded}"


def _extract_docx_images(file_obj: FileAsset) -> list[DocumentImage]:
    if not file_obj.storage_path or not zipfile.is_zipfile(file_obj.storage_path):
        return []
    images: list[DocumentImage] = []
    with zipfile.ZipFile(file_obj.storage_path) as archive:
        media_files = sorted(
            name for name in archive.namelist()
            if name.startswith("word/media/") and _file_extension(name) in SUPPORTED_IMAGE_EXTENSIONS
        )
        for index, media_name in enumerate(media_files, 1):
            data = archive.read(media_name)
            if not data or len(data) > MAX_IMAGE_BYTES:
                continue
            images.append(DocumentImage(
                source=f"{file_obj.name} - 图片{index}",
                extension=_file_extension(media_name),
                data=data,
            ))
    return images


def _extract_pdf_images(file_obj: FileAsset) -> list[DocumentImage]:
    images: list[DocumentImage] = []
    if not file_obj.storage_path:
        return images
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        return images

    try:
        reader = PdfReader(file_obj.storage_path)
        for page_index, page in enumerate(reader.pages, 1):
            for image_index, image_file in enumerate(getattr(page, "images", []) or [], 1):
                data = image_file.data
                if not data or len(data) > MAX_IMAGE_BYTES:
                    continue
                images.append(DocumentImage(
                    source=f"{file_obj.name} - 第{page_index}页图片{image_index}",
                    extension=_file_extension(image_file.name) or "png",
                    data=data,
                ))
    except Exception as exc:
        logger.warning("PDF image extraction failed: file=%s error=%s", file_obj.name, exc)
    return images


def extract_document_images(files: list[FileAsset], *, limit: int = MAX_IMAGES_PER_PROJECT) -> list[DocumentImage]:
    images: list[DocumentImage] = []
    for file_obj in files:
        if not file_obj.storage_path or not os.path.exists(file_obj.storage_path):
            continue
        extension = _file_extension(file_obj.name or file_obj.storage_path)
        try:
            if extension in SUPPORTED_IMAGE_EXTENSIONS:
                with open(file_obj.storage_path, "rb") as image_handle:
                    data = image_handle.read(MAX_IMAGE_BYTES + 1)
                if data and len(data) <= MAX_IMAGE_BYTES:
                    images.append(DocumentImage(source=f"{file_obj.name} - 原始图片", extension=extension, data=data))
            elif extension in {"docx", "doc"}:
                images.extend(_extract_docx_images(file_obj))
            elif extension == "pdf":
                images.extend(_extract_pdf_images(file_obj))
        except Exception as exc:
            logger.warning("Document image extraction failed: file=%s error=%s", file_obj.name, exc)
        if len(images) >= limit:
            return images[:limit]
    return images[:limit]


async def describe_requirement_images(files: list[FileAsset], user_id: str) -> str:
    images = extract_document_images(files)
    if not images:
        return ""

    config = await _get_config_for_task("需求解析", user_id)
    system_prompt = "你是需求文档图片识别助手。只识别图片中与软件需求、原型、流程、字段、权限、状态、规则和异常提示有关的信息。"
    prompt = (
        "请逐张识别这些需求文档图片。\n"
        "输出纯文本，不要 Markdown 表格，不要编造。\n"
        "每张图片按以下格式输出：\n"
        "图片来源：对应来源\n"
        "图片类型：页面截图/流程图/表格/原型/其他\n"
        "识别内容：列出可见文字、字段、按钮、流程节点、条件、业务规则、异常提示、权限或数据范围。\n"
        "不确定内容：看不清或无法判断的地方。\n\n"
        "图片来源顺序：\n" + "\n".join(f"{idx}. {image.source}" for idx, image in enumerate(images, 1))
    )
    try:
        result = await OpenAICompatibleClient().complete_with_images(
            endpoint=config["endpoint"],
            api_key=config["api_key"],
            model=config["model"],
            system_prompt=system_prompt,
            user_prompt=prompt,
            image_data_urls=[_data_url(image) for image in images],
            task_type="需求解析",
            max_tokens=8000,
        )
        await _mark_config_status("需求解析", user_id, "normal", "最近一次图片识别调用成功")
        if not result.strip():
            raise RuntimeError("检测到需求文档图片，但视觉模型未返回有效识别结果。请切换支持视觉输入的需求解析模型，或先补充图片中的需求文字。")
        return "[图片识别结果]\n" + result.strip()
    except Exception as exc:
        if _is_config_level_failure(exc):
            await _mark_config_status("需求解析", user_id, "abnormal", str(exc))
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in {400, 404, 415, 422}:
            raise RuntimeError("检测到需求文档图片，但当前需求解析模型或接口不支持图片识别。请切换支持视觉输入的需求解析模型，或先补充图片中的需求文字。") from exc
        logger.warning("Requirement image description failed: %s", exc)
        if isinstance(exc, RuntimeError):
            raise
        raise RuntimeError(f"检测到需求文档图片，但图片识别失败：{str(exc)[:200]}。请稍后重试，或先补充图片中的需求文字。") from exc

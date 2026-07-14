from __future__ import annotations

import os
import uuid

from sqlalchemy import select

from app.config import settings
from app.models.file_asset import FileAsset
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.status_log import StatusLog
from app.services.base import BaseService
from app.contracts.document import RequirementUpdate

ALLOWED_EXTENSIONS = {
    "docx", "doc", "pdf", "md", "txt", "json", "yaml", "yml", "csv",
    "xlsx", "xls", "png", "jpg", "jpeg",
}
MAX_FILE_SIZE = 50 * 1024 * 1024


class DocumentService(BaseService):
    """文档管理服务"""

    async def upload(self, file_content: bytes, filename: str, project_id: str) -> dict:
        if not filename or "." not in filename:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="文件必须包含扩展名")

        ext = filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        if len(file_content) > MAX_FILE_SIZE:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")

        # 保存文件
        upload_dir = os.path.join(settings.UPLOAD_DIR, project_id)
        os.makedirs(upload_dir, exist_ok=True)

        file_id = str(uuid.uuid4())
        safe_filename = f"{file_id}.{ext}"
        filepath = os.path.join(upload_dir, safe_filename)

        with open(filepath, "wb") as f:
            f.write(file_content)

        file_asset = FileAsset(
            id=file_id,
            project_id=project_id,
            name=filename,
            file_type=ext,
            size=f"{len(file_content) / 1024:.1f} KB",
            storage_path=filepath,
        )
        self.db.add(file_asset)

        # 上传文件后，若项目测试状态为「待测试」则自动变为「测试中」
        proj_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if project and project.test_status == "待测试":
            project.test_status = "测试中"
            self.db.add(StatusLog(
                project_id=project_id,
                user_id=project.user_id,
                field_name="test_status",
                old_value="待测试",
                new_value="测试中",
                change_type="auto",
                reason="上传了输入资料，进入测试流程",
            ))

        await self.db.commit()
        await self.db.refresh(file_asset)
        return self._to_dict(file_asset)

    async def list_by_project(self, project_id: str) -> list[dict]:
        result = await self.db.execute(
            select(FileAsset).where(FileAsset.project_id == project_id).order_by(FileAsset.uploaded_at.desc())
        )
        return [self._to_dict(f) for f in result.scalars().all()]

    async def get_by_id(self, doc_id: str) -> dict | None:
        result = await self.db.execute(select(FileAsset).where(FileAsset.id == doc_id))
        file_asset = result.scalar_one_or_none()
        if not file_asset:
            return None
        return self._to_dict(file_asset)

    async def delete(self, doc_id: str) -> bool:
        result = await self.db.execute(select(FileAsset).where(FileAsset.id == doc_id))
        file_asset = result.scalar_one_or_none()
        if not file_asset:
            return False

        # 删除物理文件
        if file_asset.storage_path and os.path.exists(file_asset.storage_path):
            os.remove(file_asset.storage_path)

        await self.db.delete(file_asset)
        await self.db.commit()
        return True

    async def get_content(self, doc_id: str) -> str | None:
        """读取文档文本内容"""
        result = await self.db.execute(select(FileAsset).where(FileAsset.id == doc_id))
        file_asset = result.scalar_one_or_none()
        if not file_asset or not file_asset.storage_path:
            return None

        if not os.path.exists(file_asset.storage_path):
            return None

        ext = file_asset.file_type.lower()

        if ext in ("txt", "md", "json", "yaml", "yml", "csv"):
            with open(file_asset.storage_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

        if ext in ("docx", "doc"):
            try:
                import docx
                doc = docx.Document(file_asset.storage_path)
                return "\n".join([p.text for p in doc.paragraphs])
            except ImportError:
                return "[docx 库未安装，无法解析 Word 文件]"

        if ext == "pdf":
            try:
                import subprocess
                result = subprocess.run(
                    ["pdftotext", file_asset.storage_path, "-"],
                    capture_output=True, text=True, timeout=30
                )
                return result.stdout
            except Exception:
                return "[PDF 解析失败]"

        if ext in ("xlsx", "xls"):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(file_asset.storage_path, read_only=True)
                texts = []
                for ws in wb.worksheets:
                    for row in ws.iter_rows(values_only=True):
                        texts.append(" | ".join([str(c) if c is not None else "" for c in row]))
                return "\n".join(texts)
            except ImportError:
                return "[openpyxl 库未安装，无法解析 Excel 文件]"

        return f"[不支持的文件类型: {ext}]"

    async def get_requirements(self, project_id: str) -> list[dict]:
        result = await self.db.execute(
            select(Requirement).where(Requirement.project_id == project_id).order_by(Requirement.created_at)
        )
        return [self._to_dict(r) for r in result.scalars().all()]

    async def update_requirement(self, req_id: str, data: RequirementUpdate) -> dict | None:
        result = await self.db.execute(select(Requirement).where(Requirement.id == req_id))
        req = result.scalar_one_or_none()
        if not req:
            return None

        update_data = data.model_dump(exclude_unset=True)
        field_map = {
            "rule": "rule",
            "question": "question",
            "confirmed": "confirmed",
            "reviewStatus": "review_status",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                setattr(req, db_key, update_data[schema_key])

        req.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(req)
        return self._to_dict(req)

    async def search_requirements(self, project_id: str, query: str) -> list[dict]:
        result = await self.db.execute(
            select(Requirement).where(
                Requirement.project_id == project_id,
                (Requirement.module.contains(query))
                | (Requirement.feature.contains(query))
                | (Requirement.rule.contains(query))
            )
        )
        return [self._to_dict(r) for r in result.scalars().all()]

    async def batch_confirm(self, req_ids: list[str], confirmed: bool) -> int:
        result = await self.db.execute(
            select(Requirement).where(Requirement.id.in_(req_ids))
        )
        count = 0
        for req in result.scalars().all():
            req.confirmed = confirmed
            count += 1
        await self.db.commit()
        return count

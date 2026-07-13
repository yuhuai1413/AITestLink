from __future__ import annotations

from sqlalchemy import select

from app.models.doc_template import DocTemplate
from app.services.base import BaseService
from app.contracts.system import DocTemplateCreate, DocTemplateUpdate


class DocTemplateService(BaseService):
    """文档模板管理服务"""

    async def create(self, user_id: str, data: DocTemplateCreate) -> dict:
        template_id = f"{user_id}_{data.config_key}"

        existing = await self.db.execute(
            select(DocTemplate).where(DocTemplate.id == template_id)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="模板已存在")

        template = DocTemplate(
            id=template_id,
            user_id=user_id,
            config_key=data.config_key,
            name=data.name,
            description=data.description,
            template_file=data.template_file,
            prompt_template=data.prompt_template,
            output_fields=data.output_fields,
            display_order=data.display_order,
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return self._to_dict(template)

    async def get_by_id(self, template_id: str) -> dict | None:
        result = await self.db.execute(select(DocTemplate).where(DocTemplate.id == template_id))
        template = result.scalar_one_or_none()
        return self._to_dict(template) if template else None

    async def list_by_user(self, user_id: str, config_key: str | None = None) -> list[dict]:
        query = select(DocTemplate).where(DocTemplate.user_id == user_id)
        if config_key:
            query = query.where(DocTemplate.config_key == config_key)
        query = query.order_by(DocTemplate.display_order, DocTemplate.created_at)
        result = await self.db.execute(query)
        return [self._to_dict(t) for t in result.scalars().all()]

    async def update(self, template_id: str, data: DocTemplateUpdate) -> dict | None:
        result = await self.db.execute(select(DocTemplate).where(DocTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if not template:
            return None

        update_data = data.model_dump(exclude_unset=True)
        field_map = {
            "name": "name",
            "description": "description",
            "template_file": "template_file",
            "prompt_template": "prompt_template",
            "output_fields": "output_fields",
            "display_order": "display_order",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                setattr(template, db_key, update_data[schema_key])

        template.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(template)
        return self._to_dict(template)

    async def delete(self, template_id: str) -> bool:
        result = await self.db.execute(select(DocTemplate).where(DocTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if not template:
            return False
        await self.db.delete(template)
        await self.db.commit()
        return True

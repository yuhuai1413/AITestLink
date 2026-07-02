# AITestLink 后端

## 启动步骤

### 1. 安装依赖
```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填写数据库连接和 LLM API Key
```

### 3. 创建数据库
```bash
# PostgreSQL
createdb aitestlink
```

### 4. 启动服务
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. 前端对接
前端 API 地址默认为 `http://localhost:8000/api`，在 `src/api/client.ts` 中配置。

## API 文档
启动后访问 http://localhost:8000/docs 查看 Swagger 文档。

## 技术栈
- FastAPI — Web 框架
- SQLAlchemy (async) — ORM
- PostgreSQL — 数据库
- httpx — LLM API 调用
- python-docx / PyPDF2 — 文件文本提取

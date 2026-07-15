# AITestLink 后端

## 启动步骤

### 1. 安装依赖
```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt  # 开发环境；生产环境使用 requirements.txt
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填写数据库连接和 LLM API Key
```

### 3. 启动服务
```bash
# 数据库自动创建（SQLite）
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### 5. 前端对接
前端开发服务器通过 Vite 将 `/api` 代理到 `http://localhost:8001`。

## API 文档
启动后访问 http://localhost:8001/docs 查看 Swagger 文档。

## 技术栈
- FastAPI — Web 框架
- SQLAlchemy (async) — ORM
- SQLite — 数据库
- httpx — LLM API 调用
- python-docx / PyPDF2 — 文件文本提取

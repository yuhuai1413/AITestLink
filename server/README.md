# AITestLink 后端服务

AITestLink 后端基于 FastAPI + SQLAlchemy Async，负责认证、项目数据、文件解析、AI 任务编排、测试设计、环境配置、系统识别、自动化执行、Excel 导出和 Word 文档生成。

## 主要职责

- 用户认证、JWT、管理员用户管理。
- 项目、输入资料、需求、测试点、测试用例的数据管理。
- AI 需求解析、测试点生成、测试用例生成、脚本生成、文档生成。
- 模型配置、连接测试、提示词版本管理。
- 环境配置、测试账号、验证码策略、系统识别。
- 自动化脚本管理和可视化执行。
- 测试用例标准 `.xlsx` 导出。
- Word 模板解析、模板结构缓存和文档渲染。
- 数据链路有效性控制，保证上游评审后下游才能使用。

## 启动步骤

### 1. 安装依赖

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

常用配置：

```env
DATABASE_URL=sqlite+aiosqlite:///./aitestlink.db
UPLOAD_DIR=./uploads
CORS_ORIGINS=http://localhost:5173
JWT_SECRET=your-secret
BASE_URL=http://localhost:8001
```

模型配置主要通过系统里的“模型配置”页面维护。

### 3. 启动服务

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

启动后访问：

```text
http://localhost:8001/docs
```

## 测试

```bash
pytest tests -q
```

或在项目根目录运行：

```bash
pytest server/tests -q
```

## 关键依赖

- FastAPI：Web API。
- SQLAlchemy Async：异步 ORM。
- httpx：模型 API 调用。
- python-docx：Word 模板解析和渲染。
- openpyxl：Excel 导出。
- Playwright / pytest：自动化脚本执行。
- PyJWT / bcrypt：认证和密码安全。

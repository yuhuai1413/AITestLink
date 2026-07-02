# AITestLink — AI 软件测试平台

AI 驱动的软件测试平台，支持从需求文档到测试用例的全链路自动化生成。

## 项目结构

```
AITestLink/
├── frontend/          ← React + TypeScript 前端
│   ├── src/           ← 源代码
│   ├── package.json
│   └── ...
├── server/            ← FastAPI + PostgreSQL 后端
│   ├── app/           ← Python 源代码
│   ├── requirements.txt
│   └── ...
├── docs/              ← 产品文档和技术架构
└── README.md
```

## 快速开始

### 前端
```bash
cd frontend
pnpm install
pnpm dev          # 启动开发服务器 http://localhost:5173
```

### 后端
```bash
cd server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 配置数据库和 LLM API Key
uvicorn app.main:app --reload --port 8000
```

### 数据库
```bash
# PostgreSQL
createdb aitestlink
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | FastAPI + SQLAlchemy (async) |
| 数据库 | SQLite |
| AI | OpenAI Compatible API (Claude/GPT) |
| 样式 | 手写 CSS（紫色主题） |

## 核心功能

- 📁 需求文档上传与管理
- 🤖 AI 需求解析（自动提取模块、功能点、业务规则）
- 🧪 AI 测试点生成（覆盖正常/异常/边界/权限场景）
- 📋 AI 测试用例生成（完整步骤、预期结果）
- ✏️ 在线编辑与评审
- 📊 Excel 导出
- 🔍 全局搜索

## API 文档

后端启动后访问 http://localhost:8000/docs 查看 Swagger API 文档。

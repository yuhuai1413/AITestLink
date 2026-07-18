# AITestLink — AI 软件测试平台

AITestLink 是一个完整的 AI 软件测试平台，覆盖从输入资料、需求解析、系统识别、测试设计、自动化脚本、脚本执行、数据汇总到文档生成的测试全流程。

项目当前是具备前后端分层、用户认证、模型配置、数据评审、链路追溯、自动化执行和文档模板生成能力的完整 Web 系统。

## 核心流程

```text
创建项目
→ 上传输入资料
→ AI 解析需求
→ 环境配置与系统识别
→ AI 生成测试点
→ 测试点评审
→ AI 生成测试用例
→ 用例评审
→ AI 生成自动化脚本
→ 脚本评审
→ 可视化执行脚本
→ 汇总测试数据
→ 按模板生成测试文档
```

平台强调“上游数据评审后，下游才能使用”。需求、测试点、测试用例和脚本之间保持追溯关系；上游数据重新生成或删除输入资料时，下游数据会被标记失效或按规则清理，避免后续数据失去来源依据。

## 主要能力

- 用户认证、管理员账号、用户管理。
- 项目空间与项目详情多阶段流转。
- 输入资料上传、解析状态、删除后级联处理。
- AI 需求解析，输出模块、功能点、规则、风险和待确认问题。
- 环境配置，支持 Web / APP 环境、测试账号、验证码策略、默认环境。
- 系统识别，结合环境、账号和需求范围识别目标系统页面和元素。
- AI 测试点生成，覆盖正常流程、异常流程、边界、权限、数据一致性、状态流转等场景。
- AI 测试用例生成，包含前置条件、步骤、数据、预期、角色、测试地址、测试端。
- 评审门禁，只有评审通过且有效的数据才能进入下游生成。
- AI 自动化脚本生成，结合测试用例、环境和系统识别结果生成脚本。
- 可视化脚本执行，支持 headed 浏览器、登录策略、执行日志和失败摘要。
- 测试用例后端导出标准 `.xlsx`，包含表头、列宽、对齐、自动换行、冻结表头和筛选。
- 文档配置与 Word 模板上传，解析模板结构并按模板填充数据生成文档。
- 模型配置，支持不同 AI 节点配置模型、连接测试和管理员提示词管理。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | FastAPI + SQLAlchemy Async |
| 数据库 | SQLite，本地开发默认；可按部署需要切换其他数据库 |
| AI 接入 | OpenAI Compatible API |
| 自动化 | Playwright / pytest 脚本生成与执行 |
| 文档处理 | python-docx / openpyxl / 模板结构解析 |
| 认证 | JWT |
| 样式 | 自定义 CSS 组件体系 |

## 目录结构

```text
AITestLink/
├── frontend/                 # React 前端
│   ├── src/api               # API 客户端
│   ├── src/features          # 页面和业务模块
│   ├── src/shared            # 公共组件、hooks、工具
│   └── src/styles            # 全局样式
├── server/                   # FastAPI 后端
│   ├── app/models            # SQLAlchemy 数据模型
│   ├── app/routers           # API 路由
│   ├── app/services          # 业务服务、AI 编排、文档渲染、自动化执行
│   ├── app/prompts           # AI 提示词目录
│   └── tests                 # 后端测试
├── docs/                     # 产品、架构、部署、汇报文档
├── scripts/                  # 辅助脚本
└── README.md
```

## 本地启动

### 后端

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

后端启动后访问：

```text
http://localhost:8001/docs
```

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

前端默认访问：

```text
http://localhost:5173
```

## 验证命令

```bash
# 前端构建
pnpm --dir frontend build

# 后端测试
pytest server/tests -q
```

## 关键设计原则

- AI 负责辅助生成和分析，人工评审负责最终确认。
- 每个阶段的数据必须可追溯到上游来源。
- 下游生成必须受上游评审状态和有效状态约束。
- 自动化脚本不能只验证登录成功，必须执行真实测试步骤并有断言。
- 文档生成优先复制用户上传的 Word 模板并填充数据，避免模型自由生成破坏模板格式。
- 失败提示必须面向用户可理解，同时保留原始错误用于排查。

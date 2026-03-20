# MCPLink

<p align="center">
  <strong>🤖 AI Agent 工具调用框架 - 让 AI 通过自然语言操作你的业务系统</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#核心-sdk">核心 SDK</a> •
  <a href="#后端服务">后端服务</a> •
  <a href="#前端界面">前端界面</a> •
  <a href="#架构设计">架构设计</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js->=18-green" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm->=8-blue" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## 简介

MCPLink 是一个完整的 **AI Agent** 解决方案，支持 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 协议。采用极简架构设计：

- 🎯 **极简核心** - 几行代码发起 AI 对话，用户自己处理响应
- 🔧 **完全自定义** - 支持任意参数（如 enable_thinking）透传给 AI
- 🔄 **原生流式** - 基于 axios SSE，真正的实时流式响应
- 🛠️ **MCP 协议** - 支持 stdio、SSE、Streamable HTTP 三种连接方式
- 📦 **标准事件** - 提供可选的标准事件流转换层
- 💪 **完整生态** - 包含核心 SDK、后端服务、前端界面三个包

## 项目结构

```
mcplink/
├── packages/
│   ├── core/      # 🎯 核心 SDK (@n0ts123/mcplink-core) - 极简 HTTP 桥接
│   ├── server/    # 🖥️ 后端服务 (Fastify) - REST API + SSE 流式
│   └── web/       # 🌐 前端界面 (Vue 3) - 调试和管理界面
├── scripts/       # 🔧 辅助脚本
└── README.md
```

### 包说明

| 包 | 路径 | 作用 |
|---|------|------|
| `@n0ts123/mcplink-core` | `packages/core` | 核心 SDK，提供 MCPLink 类、HTTP 客户端、标准事件流转换 |
| `@mcplink/server` | `packages/server` | Fastify 后端服务，提供 REST API 和 SSE 流式接口 |
| `@mcplink/web` | `packages/web` | Vue 3 前端界面，用于调试对话、管理模型和 MCP 服务器 |

---

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装与启动

```bash
# 克隆项目
git clone https://github.com/n0tssss/MCPLink.git
cd mcplink

# 安装依赖
pnpm install

# 启动开发服务
pnpm dev
```

启动后访问：
- 前端界面：http://localhost:5173
- 后端 API：http://localhost:3000

### 配置步骤

1. 打开前端界面 http://localhost:5173
2. 进入 **设置 > 模型管理**，添加你的 AI 模型
   - 支持 OpenAI、DeepSeek、Qwen、Claude、Gemini 等
   - 可自定义参数如 `enable_thinking`、`temperature` 等
3. 进入 **设置 > MCP 服务器**，添加你的 MCP 工具服务器
4. 开始对话！

---

## 核心 SDK

`@n0ts123/mcplink-core` 是项目的核心，采用极简设计理念。

### 设计哲学

- **用户掌控一切**：框架只负责发起 AI 请求，用户自己处理响应、维护消息历史
- **完全透明**：所有 AI 参数原封不动透传给提供商
- **可选增强**：标准事件流是可选的，底层事件足够简单

### 安装

```bash
npm install @n0ts123/mcplink-core
```

### 基础用法

```typescript
import { MCPLink } from '@n0ts123/mcplink-core'

const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    // 支持任意自定义参数
    temperature: 0.7,
  },
  mcpServers: {
    business: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-server.js'],
    },
  },
})

await mcpLink.initialize()

// 流式对话
for await (const event of mcpLink.chatStream([
  { role: 'user', content: '查询订单' }
])) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content)
      break
    case 'tool_call':
      console.log('调用工具:', event.toolCall.name)
      break
    case 'done':
      console.log('\n完成!')
      break
  }
}
```

### 使用标准事件流

SDK 提供可选的 `toStandardStream` 转换器：

```typescript
import { MCPLink, toStandardStream } from '@n0ts123/mcplink-core'

async function* rawStream() {
  for await (const event of mcpLink.chatStream(messages)) {
    yield event
  }
}

for await (const event of toStandardStream(rawStream(), {
  maxIterations: 10,
  executeTool: async (name, args) => await mcpLink.callTool(name, args),
})) {
  // 标准事件：text_start, text_delta, text_end, tool_call_start, tool_result...
  console.log(event.type)
}
```

完整文档：[packages/core/README.md](packages/core/README.md)

---

## 后端服务

`@mcplink/server` 是基于 Fastify 的后端服务，提供 REST API 和 SSE 流式接口。

### 功能

- 🤖 **模型管理** - 配置多模型，支持自定义参数
- 🔧 **MCP 服务器管理** - 增删改查 MCP 服务器配置
- 💬 **对话 API** - `/api/chat` 支持流式 SSE 响应
- 📦 **标准事件流** - 自动转换底层事件为标准事件

### API 列表

```
GET  /api/health                    健康检查
GET  /api/models                    获取模型列表
POST /api/models                    创建模型
PUT  /api/models/:id                更新模型
DELETE /api/models/:id              删除模型

GET  /api/mcp/servers               获取 MCP 服务器列表
POST /api/mcp/servers               创建 MCP 服务器
PUT  /api/mcp/servers/:id           更新 MCP 服务器
DELETE /api/mcp/servers/:id         删除 MCP 服务器
POST /api/mcp/servers/:id/start     启动 MCP 服务器
POST /api/mcp/servers/:id/stop      停止 MCP 服务器

POST /api/chat                      发起对话（SSE 流式）
GET  /api/conversations             获取会话列表
POST /api/conversations             创建会话
PUT  /api/conversations/:id         更新会话
DELETE /api/conversations/:id       删除会话
```

### 对话 API 示例

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "查询订单",
    "modelId": "xxx",
    "conversationId": "xxx",
    "stream": true
  }'
```

响应（SSE 流）：
```
event: connected
data: {"timestamp": 1234567890}

event: text_start
data: {}

event: text_delta
data: {"content": "我来帮您"}

event: text_delta
data: {"content": "查询订单"}

event: tool_call_start
data: {"toolName": "get_orders", "toolCallId": "call_1", "toolArgs": {}}

event: tool_result
data: {"toolName": "get_orders", "toolResult": [...], "duration": 150}

event: complete
data: {"totalIterations": 1, "totalDuration": 2500}
```

---

## 前端界面

`@mcplink/web` 是基于 Vue 3 的调试和管理界面。

### 功能模块

| 模块 | 功能 |
|------|------|
| 💬 **对话界面** | Markdown 渲染、流式输出、思考过程展示、工具调用可视化 |
| 🤖 **模型管理** | 添加/编辑 AI 模型，支持自定义参数（如 enable_thinking） |
| 🔧 **MCP 服务器** | 配置 MCP 连接，支持 stdio/streamable-http |
| 📝 **提示词管理** | 自定义系统提示词 |
| ⚙️ **设置** | 配置迭代次数、思考阶段等 |

### 界面特性

- 📱 响应式设计，支持桌面和移动端
- 🌙 深色主题
- ⚡ 流式渲染，实时显示 AI 响应
- 🔍 调试面板，查看完整的事件流

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                              前端 (Vue 3)                            │
│                         @mcplink/web                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  对话界面 │ 模型管理 │ MCP 服务器 │ 提示词设置 │ 调试面板   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP + SSE
┌─────────────────────────────────────────────────────────────────────┐
│                            后端 (Fastify)                            │
│                        @mcplink/server                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  /api/chat (SSE) │ /api/models │ /api/mcp/servers │ ...    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                    │                                │
│                   ┌────────────────┼────────────────┐               │
│                   ▼                ▼                ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    @n0ts123/mcplink-core                    │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │         MCPLink (AI + MCP Bridge)                    │  │   │
│  │  │  ┌────────────────┐  ┌─────────────────────────────┐  │  │   │
│  │  │  │ HTTP Client    │  │ MCP Manager               │  │  │   │
│  │  │  │ (axios + SSE)  │  │ (stdio/streamable-http)   │  │  │   │
│  │  │  └────────────────┘  └─────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ OpenAI    │   │ DeepSeek  │   │   Qwen    │
            │ GPT-4o    │   │   ...     │   │   ...     │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
            ┌─────────────────────────────────────────────┐
            │              MCP Servers                     │
            │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
            │  │业务工具 │ │数据查询 │ │文件操作 │  ...   │
            │  └─────────┘ └─────────┘ └─────────┘       │
            └─────────────────────────────────────────────┘
```

**架构特点**：
- **核心层**：`@n0ts123/mcplink-core` 只负责 AI HTTP 请求和 MCP 调用
- **服务层**：`@mcplink/server` 提供 REST API 和 SSE 流
- **展示层**：`@mcplink/web` 提供友好的调试界面

---

## 开发

```bash
# 开发模式（启动所有服务）
pnpm dev

# 只启动核心包开发
pnpm dev:core

# 只启动后端服务
pnpm dev:server

# 只启动前端服务
pnpm dev:web

# 构建所有包
pnpm build

# 只构建核心包
pnpm build:core

# 类型检查
pnpm typecheck
```

---

## 核心特点对比

| 特性 | MCPLink | 传统 Agent 框架 |
|------|---------|----------------|
| 架构设计 | 极简，用户掌控一切 | 复杂，框架包办一切 |
| AI SDK | axios（原生 HTTP） | Vercel AI SDK（封装层） |
| 参数传递 | 完全透传，支持任意参数 | 有限参数，封装限制 |
| 流式响应 | 原生 SSE | 封装后的流式 |
| 事件处理 | 底层事件 + 可选标准流 | 固定的事件体系 |
| 消息历史 | 用户自己维护 | 框架内部维护 |
| MCP 支持 | stdio/streamable-http | 依赖第三方封装 |

---

## 许可证

MIT License

---

## 相关链接

- [MCP 协议规范](https://modelcontextprotocol.io/)
- [核心 SDK 文档](packages/core/README.md)
- [GitHub 仓库](https://github.com/n0tssss/MCPLink)
- [问题反馈](https://github.com/n0tssss/MCPLink/issues)

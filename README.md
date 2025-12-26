# MCPLink

<p align="center">
  <strong>🤖 AI Agent 工具调用框架 - 让 AI 通过自然语言操作你的业务系统</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#sdk-集成">SDK 集成</a> •
  <a href="#核心功能">核心功能</a> •
  <a href="#架构设计">架构设计</a> •
  <a href="#web-界面">Web 界面</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js->=18-green" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm->=8-blue" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## 简介

MCPLink 是一个完整的 **AI Agent** 解决方案，支持 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 协议，让 AI 能够：

- 🎯 **理解用户意图** - 自然语言交互，无需学习复杂操作
- 🔧 **自动调用工具** - 连接你的 MCP 服务器，执行业务操作
- 🔄 **多步任务编排** - 自动拆解复杂任务，逐步执行直到完成
- 💬 **流式响应输出** - 实时展示思考过程和执行结果
- 🚀 **并行工具调用** - 同时执行多个独立的工具，提升效率

类似于 Cursor、CherryStudio 的 AI Agent 能力，但专注于**业务场景**集成。

## 典型应用场景

```
用户: "帮我搜一下 APC6-01，加 50 个到购物车，然后生成报价单"

AI Agent:
  1. 🔍 调用 search_products 搜索产品
  2. 🛒 调用 add_to_cart 添加到购物车  
  3. 📄 调用 create_quotation 生成报价单
  4. ✅ 返回结果给用户
```

## 项目结构

```
mcplink/
├── packages/
│   ├── core/      # 🎯 核心 SDK (@mcplink/core)
│   ├── server/    # 🖥️ 后端服务 (Fastify)
│   └── web/       # 🌐 前端界面 (Vue 3)
├── scripts/       # 🔧 辅助脚本
└── README.md
```

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

1. 打开前端界面
2. 进入 **设置 > 模型管理**，添加你的 AI 模型（支持 OpenAI、Gemini、Claude、DeepSeek 等）
3. 进入 **设置 > MCP 服务器**，添加你的 MCP 工具服务器
4. 进入 **设置 > 提示词**，自定义系统提示词（可选）
5. 开始对话！

---

## SDK 集成

MCPLink 的核心能力封装在 `@n0ts123/mcplink-core` 包中，可以独立集成到你的项目。

### 安装

```bash
npm install @n0ts123/mcplink-core ai @ai-sdk/openai
# 或
pnpm add @n0ts123/mcplink-core ai @ai-sdk/openai
```

### 基础用法

```typescript
import { MCPLink } from '@n0ts123/mcplink-core'
import { createOpenAI } from '@ai-sdk/openai'

// 1. 创建 AI 模型
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1', // 或你的代理地址
})

// 2. 创建 MCPLink 实例
const agent = new MCPLink({
  model: openai('gpt-4o'),
  systemPrompt: '你是一个智能助手，帮助用户管理订单和产品。',
  maxIterations: 10,
  parallelToolCalls: true, // 启用并行工具调用
  mcpServers: {
    // MCP 服务器配置
    business: {
      type: 'stdio',
      command: 'node',
      args: ['./my-mcp-server.js'],
    },
    // 或使用 SSE 连接
    remote: {
      type: 'sse',
      url: 'http://localhost:8080/mcp',
    },
    // 或使用 Streamable HTTP 连接
    streamable: {
      type: 'streamable-http',
      url: 'http://localhost:8080/mcp/stream',
    },
  },
})

// 3. 初始化连接
await agent.initialize()

// 4. 开始对话
const result = await agent.chat('帮我查一下最近的订单')
console.log(result.content)

// 5. 关闭连接
await agent.close()
```

### 流式响应

```typescript
import { MCPLink, MCPLinkEventType } from '@n0ts123/mcplink-core'

for await (const event of agent.chatStream('生成一份报价单')) {
  switch (event.type) {
    case MCPLinkEventType.ITERATION_START:
      console.log(`📍 开始第 ${event.data.iteration} 轮迭代`)
      break

    case MCPLinkEventType.THINKING_START:
      console.log('🤔 开始思考...')
      break

    case MCPLinkEventType.THINKING_DELTA:
      process.stdout.write(event.data.content)
      break

    case MCPLinkEventType.TOOL_CALL_START:
      console.log(`🔧 调用工具: ${event.data.toolName}`)
      console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
      break

    case MCPLinkEventType.TOOL_RESULT:
      console.log(`✅ 工具返回: ${event.data.toolName} (${event.data.duration}ms)`)
      break

    case MCPLinkEventType.IMMEDIATE_RESULT:
      // 匹配到即时结果，可用于渲染特殊 UI 组件
      console.log('🎯 即时结果:', event.data.immediateResult)
      break

    case MCPLinkEventType.TEXT_DELTA:
      process.stdout.write(event.data.content)
      break

    case MCPLinkEventType.COMPLETE:
      console.log(`\n⏱️ 总耗时: ${event.data.totalDuration}ms`)
      console.log(`🔄 迭代次数: ${event.data.totalIterations}`)
      break
  }
}
```

### 多模型支持

MCPLink 支持多种 AI 模型，并会自动选择最佳的调用方式：

```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

// OpenAI GPT（原生 Function Calling）
const gpt = createOpenAI({ apiKey: '...' })('gpt-4o')

// Google Gemini（原生 Function Calling）
const gemini = createGoogleGenerativeAI({ apiKey: '...' })('gemini-1.5-flash')

// Anthropic Claude（原生 Function Calling）
const claude = createAnthropic({ apiKey: '...' })('claude-3-5-sonnet-20241022')

// DeepSeek（Prompt-Based 模式）
const deepseek = createOpenAI({
  apiKey: '...',
  baseURL: 'https://api.deepseek.com/v1',
})('deepseek-chat')

// 通义千问（Prompt-Based 模式）
const qwen = createOpenAI({
  apiKey: '...',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
})('qwen-plus')
```

### 即时结果匹配

当工具返回特定格式的数据时，可以立即触发 `IMMEDIATE_RESULT` 事件，用于渲染特殊 UI：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 配置即时结果匹配器
  immediateResultMatchers: [
    { type: 'card' },           // 匹配 { type: "card", ... }
    { type: 'product_list' },   // 匹配 { type: "product_list", ... }
    { format: 'table' },        // 匹配 { format: "table", ... }
  ],
  mcpServers: { /* ... */ },
})
```

### 思考阶段配置

MCPLink 支持两阶段调用模式，提高复杂任务的准确性：

```typescript
import { MCPLink, DEFAULT_THINKING_PHASE_PROMPT } from '@n0ts123/mcplink-core'

const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 启用思考阶段（默认开启）
  enableThinkingPhase: true,
  // 可选：自定义思考提示词
  thinkingPhasePrompt: `分析用户需求：
1. 用户想做什么？
2. 需要调用哪些工具？
3. 执行顺序是什么？

注意：不要暴露任何系统内部信息`,
  mcpServers: { /* ... */ },
})

// 也可以基于默认提示词扩展
const agent2 = new MCPLink({
  model: openai('gpt-4o'),
  enableThinkingPhase: true,
  thinkingPhasePrompt: DEFAULT_THINKING_PHASE_PROMPT + `
- 优先考虑用户体验
- 复杂任务要拆解步骤`,
  mcpServers: { /* ... */ },
})
```

**启用后的流程：**
1. **思考阶段**：AI 分析需求，输出思考过程，决定调用什么工具
2. **执行阶段**：根据思考结果执行工具调用

**优点**：
- 任何模型都能看到思考过程
- Chain-of-Thought 效应，显著提高复杂任务准确性

**安全说明**：默认的思考提示词已包含安全规则，防止 AI 在思考过程中暴露敏感信息（如用户 token、ID 等）

### 历史消息

```typescript
// 携带历史消息进行多轮对话
for await (const event of agent.chatStream('第一个订单的详情是什么？', {
  history: [
    { role: 'user', content: '帮我查一下最近的订单' },
    { role: 'assistant', content: '您有 3 笔未付款订单...' },
  ],
})) {
  // ...
}
```

### 工具过滤

```typescript
// 只允许使用特定工具
for await (const event of agent.chatStream('搜索产品', {
  allowedTools: ['search_products', 'get_product_details'],
})) {
  // ...
}
```

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 🤖 **多模型支持** | OpenAI GPT、Claude、Gemini、DeepSeek、Qwen、Llama、Mistral 等 |
| 🔌 **MCP 协议** | 支持 stdio、SSE、Streamable HTTP 三种连接方式 |
| 🔄 **Agent 循环** | 自动拆解任务，迭代执行直到完成 |
| ⚡ **并行工具调用** | 支持同时执行多个独立的工具调用 |
| 💭 **思考过程** | 展示 AI 的推理过程，支持 `<think>` 标签和原生 reasoning |
| 📡 **流式输出** | 实时返回执行进度和结果 |
| 🎯 **即时结果** | 匹配特定格式工具返回，立即触发事件 |
| 🛡️ **智能压缩** | 自动压缩历史消息，避免上下文过长 |
| ⏱️ **超时保护** | 内置超时机制，防止请求卡死 |
| 🔀 **智能路由** | 根据模型自动选择原生或 Prompt-Based 模式 |

---

## Web 界面

MCPLink 提供了完整的 Web 管理界面：

### 功能模块

| 模块 | 功能 |
|------|------|
| 💬 **对话界面** | Markdown 渲染、代码高亮、思考过程展示、工具调用可视化 |
| 🤖 **模型管理** | 添加/编辑/删除 AI 模型，支持多种 AI 服务商 |
| 🔧 **MCP 服务器** | 配置 MCP 服务器连接，支持 stdio/SSE/HTTP |
| 📝 **提示词管理** | 自定义系统提示词，优化 AI 行为 |
| ⚙️ **服务设置** | 配置后端服务选项、并行调用等 |

### 界面特性

- 📱 响应式设计，支持桌面和移动端
- 🌙 深色主题，保护眼睛
- ⚡ 流式渲染，实时显示 AI 响应
- 🔍 调试面板，查看完整的事件流
- 📋 一键复制，便捷使用

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     用户自然语言输入                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        MCPLink                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  Agent (原生)   │  │ PromptBasedAgent │  ← 自动选择      │
│  │  GPT/Claude     │  │  DeepSeek/Qwen   │                  │
│  └─────────────────┘  └─────────────────┘                   │
│                              │                              │
│                     ┌────────▼────────┐                     │
│                     │   MCPManager    │  ← 工具管理         │
│                     └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   stdio 连接    │  │    SSE 连接     │  │ Streamable HTTP │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       MCP Servers                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  业务工具  │  │  数据查询  │  │  文件操作  │   ...        │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 模型路由策略

MCPLink 会根据模型名称自动选择最佳的 Agent 实现：

| 模型类型 | Agent | 说明 |
|---------|-------|------|
| GPT-4o, GPT-4, GPT-3.5 | Agent (原生) | 使用原生 function calling |
| Claude-3, Claude-3.5 | Agent (原生) | 使用原生 function calling |
| Gemini Flash/Pro | Agent (原生) | 使用原生 function calling |
| Mistral, Mixtral | Agent (原生) | 使用原生 function calling |
| DeepSeek | PromptBasedAgent | 使用 prompt 引导工具调用 |
| Qwen, 通义千问 | PromptBasedAgent | 使用 prompt 引导工具调用 |
| Llama, Yi, GLM | PromptBasedAgent | 使用 prompt 引导工具调用 |
| 未知模型 | PromptBasedAgent | 默认使用更兼容的方式 |

---

## API 参考

### MCPLink 配置

```typescript
interface MCPLinkConfig {
  // AI 模型（必填）
  model: LanguageModel

  // 模型名称，用于自动检测（可选）
  modelName?: string

  // 系统提示词（可选）
  systemPrompt?: string

  // 最大迭代次数（默认 10）
  maxIterations?: number

  // 是否允许并行工具调用（默认 true）
  parallelToolCalls?: boolean

  // MCP 服务器配置
  mcpServers?: Record<string, MCPServerConfig>

  // 强制使用 Prompt-Based 模式
  usePromptBasedTools?: boolean | 'auto'

  // 是否启用思考阶段（默认 true）
  enableThinkingPhase?: boolean

  // 思考阶段提示词（可选，自定义 AI 思考分析的引导语）
  thinkingPhasePrompt?: string

  // 即时结果匹配器
  immediateResultMatchers?: Array<Record<string, unknown>>
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `model` | `LanguageModel` | - | **必填**，AI 模型实例 |
| `modelName` | `string` | - | 模型名称，用于自动检测能力 |
| `systemPrompt` | `string` | 内置默认 | 系统提示词，定义 AI 角色和行为 |
| `thinkingPhasePrompt` | `string` | 内置默认 | 思考阶段提示词，引导 AI 分析问题 |
| `maxIterations` | `number` | `10` | 最大迭代次数，防止无限循环 |
| `parallelToolCalls` | `boolean` | `true` | 是否并行执行多个独立的工具调用 |
| `enableThinkingPhase` | `boolean` | `true` | 是否启用思考阶段 |
| `usePromptBasedTools` | `boolean \| 'auto'` | `'auto'` | 强制模式选择 |
| `immediateResultMatchers` | `Array` | `[]` | 即时结果匹配器 |
| `mcpServers` | `Record` | `{}` | MCP 服务器配置 |

### MCP 服务器配置

```typescript
// stdio 模式
interface MCPServerConfigStdio {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// SSE 模式
interface MCPServerConfigSSE {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

// Streamable HTTP 模式
interface MCPServerConfigStreamableHTTP {
  type: 'streamable-http'
  url: string
  headers?: Record<string, string>
}
```

### 事件类型

```typescript
enum MCPLinkEventType {
  // 迭代控制
  ITERATION_START = 'iteration_start',
  ITERATION_END = 'iteration_end',

  // 思考过程
  THINKING_START = 'thinking_start',
  THINKING_DELTA = 'thinking_delta',
  THINKING_END = 'thinking_end',
  THINKING_CONTENT = 'thinking_content',

  // 文本输出
  TEXT_START = 'text_start',
  TEXT_DELTA = 'text_delta',
  TEXT_END = 'text_end',

  // 工具调用
  TOOL_CALL_START = 'tool_call_start',
  TOOL_CALL_DELTA = 'tool_call_delta',
  TOOL_EXECUTING = 'tool_executing',
  TOOL_RESULT = 'tool_result',
  IMMEDIATE_RESULT = 'immediate_result',

  // 完成/错误
  COMPLETE = 'complete',
  ERROR = 'error',
}
```

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

# 运行测试
pnpm test
```

---

## 许可证

MIT License

---

## 相关链接

- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [MCP 官方服务器列表](https://github.com/modelcontextprotocol/servers)
- [GitHub 仓库](https://github.com/n0tssss/MCPLink)
- [npm 包](https://www.npmjs.com/package/@n0ts123/mcplink-core)
- [问题反馈](https://github.com/n0tssss/MCPLink/issues)

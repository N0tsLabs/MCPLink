# @n0ts123/mcplink-core

更方便的在代码里集成 MCP 工具直接让 AI 使用。

[![npm version](https://img.shields.io/npm/v/@n0ts123/mcplink-core.svg)](https://www.npmjs.com/package/@n0ts123/mcplink-core)
[![license](https://img.shields.io/npm/l/@n0ts123/mcplink-core.svg)](https://github.com/n0tssss/MCPLink/blob/master/LICENSE)

## 这是什么

用代码让 AI 调用 [MCP](https://modelcontextprotocol.io/) 工具，自动完成多步任务。

```
你："帮我查一下最近订单"
AI：调用 get_orders 工具 → 收到结果 → "您有3个订单..."
```

**特点**：流式响应、支持任意 AI 参数、你自己掌控消息历史。

## 安装

```bash
npm install @n0ts123/mcplink-core
```

## 用法

```bash
# npm
npm install @n0ts123/mcplink-core

# pnpm
pnpm add @n0ts123/mcplink-core

# yarn
yarn add @n0ts123/mcplink-core
```

## 🚀 快速开始

### 基础用法

```typescript
import { MCPLink } from '@n0ts123/mcplink-core'

// 创建 MCPLink 实例
const mcpLink = new MCPLink({
  // AI 配置（OpenAI 兼容格式）
  ai: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    // 支持任意自定义参数
    temperature: 0.7,
    enable_thinking: false,
  },
  // MCP 服务器配置
  mcpServers: {
    myTools: {
      type: 'stdio',
      command: 'node',
      args: ['./my-mcp-server.js'],
    },
  },
})

// 初始化
await mcpLink.initialize()

// 发起对话（用户自己处理流式响应）
for await (const event of mcpLink.chatStream([
  { role: 'user', content: '你好' }
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

await mcpLink.close()
```

### 使用标准事件流

如果你希望使用更丰富的标准事件，可以使用 `toStandardStream`：

```typescript
import { MCPLink, toStandardStream, type StandardStreamEvent } from '@n0ts123/mcplink-core'

const mcpLink = new MCPLink({
  ai: { baseURL: '...', apiKey: '...', model: 'gpt-4o' },
  mcpServers: { /* ... */ },
})

await mcpLink.initialize()

// 创建底层流
async function* rawStream() {
  for await (const event of mcpLink.chatStream([
    { role: 'user', content: '查询订单' }
  ])) {
    yield event
  }
}

// 转换为标准事件流
for await (const event of toStandardStream(rawStream(), {
  maxIterations: 10,
  executeTool: async (name, args) => {
    return await mcpLink.callTool(name, args)
  },
})) {
  switch (event.type) {
    case 'text_start':
      console.log('开始输出文本...')
      break
    case 'text_delta':
      process.stdout.write(event.content)
      break
    case 'text_end':
      console.log('\n文本输出结束')
      break
    case 'tool_call_start':
      console.log(`调用工具: ${event.toolName}`)
      break
    case 'tool_executing':
      console.log(`执行中: ${event.toolName}...`)
      break
    case 'tool_result':
      console.log(`结果: ${JSON.stringify(event.toolResult)}`)
      break
    case 'complete':
      console.log(`完成! 耗时: ${event.totalDuration}ms`)
      break
  }
}
```

## ⚙️ 配置选项

### MCPLinkConfig

```typescript
interface MCPLinkConfig {
  /** AI 配置（OpenAI 兼容格式） */
  ai: {
    baseURL: string
    apiKey: string
    model: string
    // 支持任意自定义参数
    temperature?: number
    max_tokens?: number
    enable_thinking?: boolean
    // 其他参数...
    [key: string]: unknown
  }

  /** 适配器类型（默认 'openai'） */
  adapter?: 'openai' | AIAdapter

  /** MCP 服务器配置 */
  mcpServers?: Record<string, MCPServerConfig>

  /** 最大迭代次数（默认 10） */
  maxIterations?: number
}
```

### 完全自定义参数

所有在 `ai` 中的参数都会原封不动传递给 AI 提供商：

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
    model: 'qwen3.5-plus',
    // 完全自定义参数
    temperature: 0.8,
    max_tokens: 2048,
    enable_thinking: true,      // Qwen 思考模式
    top_p: 0.9,
    // 任意其他参数...
    custom_param: 'value',
  },
  mcpServers: { /* ... */ },
})
```

### MCP 服务器配置

```typescript
// Stdio 模式（本地进程）
interface MCPServerConfigStdio {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// Streamable HTTP 模式
interface MCPServerConfigStreamableHTTP {
  type: 'streamable-http'
  url: string
  headers?: Record<string, string>
}
```

## 🎯 核心概念

### 底层事件（Raw Events）

MCPLink 返回最原始的 AI 事件：

```typescript
type AIStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: 'done' }
  | { type: 'error'; error: Error }
```

**设计哲学**：用户自己处理 AI 响应，框架不做多余的事情。

### 标准事件流（Standard Events）

提供可选的 `toStandardStream` 转换器，将底层事件转换为更丰富的标准事件：

```typescript
type StandardStreamEvent =
  | { type: 'text_start' }
  | { type: 'text_delta'; content: string }
  | { type: 'text_end' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end' }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string; toolArgs: Record<string, unknown> }
  | { type: 'tool_executing'; toolCallId: string; toolName: string }
  | { type: 'tool_result'; toolCallId: string; toolName: string; toolResult: unknown; duration: number; isError?: boolean }
  | { type: 'complete'; totalIterations: number; totalDuration: number }
  | { type: 'error'; error: Error }
```

## 🤖 多模型支持

MCPLink 使用 OpenAI 兼容格式，支持任意 AI 提供商：

### OpenAI

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
  },
})
```

### DeepSeek

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
  },
})
```

### 通义千问 (Qwen)

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
    model: 'qwen3.5-plus',
    enable_thinking: false,  // 关闭思考
  },
})
```

### Claude (OpenAI 兼容)

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://api.anthropic.com/v1',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet',
  },
})
```

### Gemini (OpenAI 兼容)

```typescript
const mcpLink = new MCPLink({
  ai: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: process.env.GOOGLE_API_KEY,
    model: 'gemini-1.5-flash',
  },
})
```

## 🛠️ API 参考

### MCPLink

```typescript
class MCPLink {
  constructor(config: MCPLinkConfig)

  /** 初始化 MCP 连接 */
  async initialize(): Promise<void>

  /** 关闭所有连接 */
  async close(): Promise<void>

  /** 发起对话（非流式） */
  async chat(options: ChatOptions): Promise<ChatResult>

  /** 发起对话（流式，返回底层事件） */
  async chatStream(
    messages: Message[],
    onStream?: (event: AIStreamEvent) => boolean | void
  ): Promise<ChatResult>

  /** 获取所有可用工具 */
  getTools(): MCPTool[]

  /** 调用指定工具 */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>

  /** 获取 MCP 服务器状态 */
  getMCPServerStatuses(): MCPServerStatus[]

  /** 启动/停止 MCP 服务器 */
  async startMCPServer(id: string): Promise<void>
  async stopMCPServer(id: string): Promise<void>
}
```

### toStandardStream

将底层事件流转换为标准事件流：

```typescript
async function* toStandardStream(
  rawStream: AsyncGenerator<AIStreamEvent>,
  options: {
    maxIterations?: number
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
    onRawEvent?: (event: AIStreamEvent) => boolean | void
  }
): AsyncGenerator<StandardStreamEvent>
```

### collectStandardResponse

收集流式响应为完整结果（非流式场景）：

```typescript
async function collectStandardResponse(
  stream: AsyncGenerator<StandardStreamEvent>
): Promise<{
  content: string
  toolCalls: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: unknown
    duration?: number
    isError?: boolean
  }>
  iterations: number
  duration: number
}>
```

## 📋 事件类型对比

| 底层事件 | 标准事件 | 说明 |
|---------|---------|------|
| `text` | `text_start` / `text_delta` / `text_end` | 文本输出拆分 |
| `tool_call` | `tool_call_start` / `tool_executing` / `tool_result` | 工具调用拆分 |
| - | `thinking_start` / `thinking_delta` / `thinking_end` | 思考过程（可选） |
| `done` | `complete` | 完成事件 |
| `error` | `error` | 错误事件 |

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         你的应用                             │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  底层事件流处理  │  │        标准事件流处理            │   │
│  │  (完全自定义)   │  │  (使用 toStandardStream)        │   │
│  └────────┬────────┘  └───────────────┬─────────────────┘   │
│           │                           │                     │
│           ▼                           ▼                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    MCPLink Core                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │            HTTP Client (axios + SSE)           │  │  │
│  │  └─────────────────────┬───────────────────────────┘  │  │
│  │                        │                              │  │
│  │                   ┌────▼────┐                         │  │
│  │                   │ OpenAI  │   ← 可扩展其他适配器     │  │
│  │                   │ Adapter │                         │  │
│  │                   └────┬────┘                         │  │
│  │                        │                              │  │
│  │  ┌─────────────────────▼───────────────────────────┐  │  │
│  │  │              MCP Manager                        │  │  │
│  │  └─────────────────────┬───────────────────────────┘  │  │
│  └────────────────────────┼──────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   MCP Server    │ │   MCP Server    │ │   MCP Server    │
│    (stdio)      │ │ (streamable-http)│ │    (stdio)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**设计原则**：
- **最小侵入**：只负责 AI 调用和 MCP 工具执行
- **用户掌控**：用户自己处理响应，维护消息历史
- **完全透明**：所有 AI 参数原封透传
- **可选增强**：标准事件流是可选的转换层

## 📦 导出列表

```typescript
// 核心类
export { MCPLink } from './MCPLink.js'
export { MCPManager } from './MCPManager.js'
export { HttpClient } from './http-client.js'

// 适配器
export { OpenAIAdapter, openaiAdapter } from './adapters/openai.js'

// 标准事件流
export {
  toStandardStream,
  collectStandardResponse,
  type StandardStreamEvent,
  type StandardStreamOptions,
  type StandardResponse,
} from './standard-stream.js'

// 类型
export type {
  MCPLinkConfig,
  MCPServerConfig,
  AIRequestConfig,
  Message,
  AIStreamEvent,
  ChatResult,
  MCPTool,
  MCPServerStatus,
} from './types.js'
```

## 📝 环境要求

- **Node.js**: >= 18.0.0
- **模块系统**: ES Module

## 🔗 相关链接

- [GitHub 仓库](https://github.com/n0tssss/MCPLink)
- [完整文档](https://github.com/n0tssss/MCPLink#readme)
- [问题反馈](https://github.com/n0tssss/MCPLink/issues)
- [MCP 协议规范](https://modelcontextprotocol.io/)

## 📄 许可证

MIT License © [n0tssss](https://github.com/n0tssss)

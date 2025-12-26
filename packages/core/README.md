# @n0ts123/mcplink-core

MCPLink 核心 SDK - AI Agent 工具调用框架，让 AI 轻松调用 MCP 工具。

[![npm version](https://img.shields.io/npm/v/@n0ts123/mcplink-core.svg)](https://www.npmjs.com/package/@n0ts123/mcplink-core)
[![license](https://img.shields.io/npm/l/@n0ts123/mcplink-core.svg)](https://github.com/n0tssss/MCPLink/blob/master/LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-n0tssss%2FMCPLink-blue)](https://github.com/n0tssss/MCPLink)

## ✨ 特性

- 🚀 **简单易用** - 几行代码即可让 AI 调用 MCP 工具
- 🔄 **流式响应** - 支持实时流式输出，体验更流畅
- 🤖 **多模型支持** - OpenAI GPT、Claude、Gemini、DeepSeek、Qwen、Llama 等
- 🛠️ **MCP 协议** - 支持 stdio、SSE、Streamable HTTP 三种连接方式
- ⚡ **并行调用** - 支持同时执行多个独立的工具调用
- 💭 **思考过程** - 展示 AI 推理过程，支持 `<think>` 标签和原生 reasoning
- 🎯 **即时结果** - 工具返回特定格式时立即推送（如卡片消息）
- 🔀 **智能路由** - 根据模型自动选择原生或 Prompt-Based 模式
- 📦 **TypeScript** - 完整的类型支持

## 📦 安装

```bash
# npm
npm install @n0ts123/mcplink-core

# pnpm
pnpm add @n0ts123/mcplink-core

# yarn
yarn add @n0ts123/mcplink-core
```

> 💡 **内置 AI SDK**：本包已内置 `@ai-sdk/openai` 和 `@ai-sdk/anthropic`，无需额外安装即可直接使用。
>
> 如需使用 Google Gemini，需额外安装：`npm install @ai-sdk/google`

## 🚀 快速开始

### TypeScript / JavaScript (ESM)

```typescript
import { MCPLink, createOpenAI } from '@n0ts123/mcplink-core'

// 创建模型
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',  // 可选
})

// 创建 Agent
const agent = new MCPLink({
  model: openai('gpt-4o'),
  systemPrompt: '你是一个智能助手',
  maxIterations: 10,
  parallelToolCalls: true,  // 启用并行工具调用
  mcpServers: {
    // stdio 模式
    myTools: {
      type: 'stdio',
      command: 'node',
      args: ['./my-mcp-server.js'],
    },
    // SSE 模式
    remote: {
      type: 'sse',
      url: 'http://localhost:8080/mcp',
    },
    // Streamable HTTP 模式
    streamable: {
      type: 'streamable-http',
      url: 'http://localhost:8080/mcp/stream',
    },
  },
})

// 初始化并对话
await agent.initialize()
const result = await agent.chat('你好')
console.log(result.content)
await agent.close()
```

### JavaScript (CommonJS)

> ⚠️ 注意：本包是 ES Module，在 CommonJS 环境中需要使用动态 import

```javascript
async function main() {
  const { MCPLink, createOpenAI } = await import('@n0ts123/mcplink-core')

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const agent = new MCPLink({
    model: openai('gpt-4o'),
    mcpServers: {
      myTools: {
        type: 'stdio',
        command: 'node',
        args: ['./my-mcp-server.js'],
      },
    },
  })

  await agent.initialize()
  const result = await agent.chat('你好')
  console.log(result.content)
  await agent.close()
}

main()
```

### 流式响应

```typescript
import { MCPLink, MCPLinkEventType, createOpenAI } from '@n0ts123/mcplink-core'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

const agent = new MCPLink({
  model: openai('gpt-4o'),
  mcpServers: { /* ... */ },
})

await agent.initialize()

for await (const event of agent.chatStream('帮我查询订单')) {
  switch (event.type) {
    case MCPLinkEventType.ITERATION_START:
      console.log(`📍 开始第 ${event.data.iteration} 轮迭代`)
      break
      
    case MCPLinkEventType.THINKING_START:
      console.log('💭 思考中...')
      break
      
    case MCPLinkEventType.THINKING_DELTA:
      process.stdout.write(event.data.content || '')
      break
      
    case MCPLinkEventType.TOOL_CALL_START:
      console.log(`🔧 调用工具: ${event.data.toolName}`)
      console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
      break
      
    case MCPLinkEventType.TOOL_RESULT:
      const status = event.data.isError ? '❌' : '✅'
      console.log(`${status} 结果 (${event.data.duration}ms)`)
      break

    case MCPLinkEventType.IMMEDIATE_RESULT:
      // 即时结果，可用于渲染特殊 UI
      console.log('🎯 即时结果:', event.data.immediateResult)
      break
      
    case MCPLinkEventType.TEXT_DELTA:
      process.stdout.write(event.data.content || '')
      break
      
    case MCPLinkEventType.COMPLETE:
      console.log(`\n✅ 完成! 耗时: ${event.data.totalDuration}ms, 迭代: ${event.data.totalIterations}`)
      break
      
    case MCPLinkEventType.ERROR:
      console.error(`❌ 错误: ${event.data.error}`)
      break
  }
}
```

## ⚙️ 配置选项

### MCPLinkConfig

```typescript
interface MCPLinkConfig {
  /** AI 模型实例（必填）*/
  model: LanguageModel

  /** 模型名称，用于自动检测是否支持原生 function calling */
  modelName?: string

  /** 系统提示词 */
  systemPrompt?: string

  /** 最大迭代次数（默认 10）*/
  maxIterations?: number

  /** MCP 服务器配置 */
  mcpServers?: Record<string, MCPServerConfig>

  /** 是否并行执行工具调用（默认 true）*/
  parallelToolCalls?: boolean

  /** 
   * 是否强制使用 Prompt-Based 模式
   * - true: 强制使用 PromptBasedAgent
   * - false: 强制使用原生 Agent
   * - 'auto': 自动检测（默认）
   */
  usePromptBasedTools?: boolean | 'auto'

  /**
   * 是否启用思考阶段（默认 true）
   * 启用后每次迭代会先让 AI 思考分析，再执行工具调用
   * 优点：Chain-of-Thought 效应，提高复杂任务准确性
   */
  enableThinkingPhase?: boolean

  /**
   * 思考阶段提示词（可选）
   * 自定义 AI 在调用工具前的思考分析提示
   * 不配置则使用内置的默认提示词
   */
  thinkingPhasePrompt?: string

  /** 即时结果匹配器，匹配时触发 IMMEDIATE_RESULT 事件 */
  immediateResultMatchers?: Array<Record<string, unknown>>
}
```

### 配置项详解

#### 1. `systemPrompt` - 系统提示词

定义 AI 的角色和行为规范：

```typescript
import { MCPLink, DEFAULT_SYSTEM_PROMPT } from '@n0ts123/mcplink-core'

const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 完全自定义
  systemPrompt: `你是一个电商客服助手。
  
## 你的职责
- 帮助用户查询订单
- 解答产品问题
- 处理售后服务

## 回复风格
- 专业、简洁、热情
- 使用 emoji 增加亲和力`,
  mcpServers: { /* ... */ },
})

// 也可以基于默认提示词扩展
const agent2 = new MCPLink({
  model: openai('gpt-4o'),
  systemPrompt: DEFAULT_SYSTEM_PROMPT + `

## 额外规则
- 回复不超过 200 字
- 重要信息用加粗标注`,
  mcpServers: { /* ... */ },
})
```

#### 2. `thinkingPhasePrompt` - 思考阶段提示词

自定义 AI 在调用工具前的思考分析过程：

```typescript
import { MCPLink, DEFAULT_THINKING_PHASE_PROMPT } from '@n0ts123/mcplink-core'

const agent = new MCPLink({
  model: openai('gpt-4o'),
  enableThinkingPhase: true,
  // 完全自定义思考提示词
  thinkingPhasePrompt: `请分析用户的需求：

1. 用户想做什么？
2. 需要调用哪些工具？
3. 执行顺序是什么？

注意事项：
- 用自然语言表达思考过程
- 不要暴露任何系统内部信息
- 不要展示技术细节或数据结构`,
  mcpServers: { /* ... */ },
})

// 基于默认提示词扩展
const agent2 = new MCPLink({
  model: openai('gpt-4o'),
  enableThinkingPhase: true,
  thinkingPhasePrompt: DEFAULT_THINKING_PHASE_PROMPT + `
- 优先考虑用户体验
- 复杂任务要拆解步骤`,
  mcpServers: { /* ... */ },
})
```

**安全说明**：默认的思考提示词已包含安全规则，防止 AI 在思考过程中暴露敏感信息（如用户 token、ID 等）。自定义时请确保包含类似的安全约束。

#### 3. `maxIterations` - 最大迭代次数

控制 Agent 循环的最大轮数，防止无限循环：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 简单任务，减少迭代
  maxIterations: 5,
  mcpServers: { /* ... */ },
})

const complexAgent = new MCPLink({
  model: openai('gpt-4o'),
  // 复杂任务，允许更多迭代
  maxIterations: 20,
  mcpServers: { /* ... */ },
})
```

#### 4. `parallelToolCalls` - 并行工具调用

控制是否同时执行多个独立的工具调用：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 启用并行调用（默认）- 多个独立工具同时执行
  parallelToolCalls: true,
  mcpServers: { /* ... */ },
})

const serialAgent = new MCPLink({
  model: openai('gpt-4o'),
  // 禁用并行 - 工具依次执行，适合有依赖关系的场景
  parallelToolCalls: false,
  mcpServers: { /* ... */ },
})
```

#### 5. `enableThinkingPhase` - 启用思考阶段

控制是否在工具调用前进行思考分析：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  // 启用思考阶段（默认）- 提高准确性
  enableThinkingPhase: true,
  mcpServers: { /* ... */ },
})

const fastAgent = new MCPLink({
  model: openai('gpt-4o'),
  // 禁用思考阶段 - 减少延迟，适合简单任务
  enableThinkingPhase: false,
  mcpServers: { /* ... */ },
})
```

#### 6. `immediateResultMatchers` - 即时结果匹配器

定义哪些工具返回结果需要立即推送给前端：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  immediateResultMatchers: [
    { type: 'card' },            // 匹配 { type: "card", ... }
    { type: 'product_list' },    // 匹配 { type: "product_list", ... }
    { format: 'table' },         // 匹配 { format: "table", ... }
    { action: 'redirect' },      // 匹配 { action: "redirect", url: "..." }
  ],
  mcpServers: { /* ... */ },
})
```

#### 7. `usePromptBasedTools` - 强制模式选择

强制指定使用原生或 Prompt-Based 模式：

```typescript
// 自动检测（默认）
const autoAgent = new MCPLink({
  model: openai('gpt-4o'),
  usePromptBasedTools: 'auto',
  mcpServers: { /* ... */ },
})

// 强制使用 Prompt-Based 模式
const promptAgent = new MCPLink({
  model: openai('gpt-4o'),
  usePromptBasedTools: true,
  mcpServers: { /* ... */ },
})

// 强制使用原生 Function Calling
const nativeAgent = new MCPLink({
  model: openai('gpt-4o'),
  usePromptBasedTools: false,
  mcpServers: { /* ... */ },
})
```

### 完整配置示例

```typescript
import { 
  MCPLink, 
  createOpenAI,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_THINKING_PHASE_PROMPT 
} from '@n0ts123/mcplink-core'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
})

const agent = new MCPLink({
  // 必填：AI 模型
  model: openai('gpt-4o'),
  
  // 可选：模型名称（用于自动检测能力）
  modelName: 'gpt-4o',
  
  // 可选：系统提示词
  systemPrompt: `你是一个智能客服助手。

## 职责
- 帮助用户查询和管理订单
- 解答产品相关问题
- 提供专业的购物建议

## 回复规范
- 简洁明了，重点突出
- 使用列表展示多条信息
- 金额用 ¥ 符号标注`,

  // 可选：思考阶段提示词
  thinkingPhasePrompt: `分析用户需求：
1. 用户的核心诉求是什么？
2. 需要获取哪些信息？
3. 应该调用什么工具？

规则：
- 不要暴露任何内部信息
- 用自然语言表达
- 专注于解决用户问题`,

  // 可选：最大迭代次数
  maxIterations: 10,
  
  // 可选：并行工具调用
  parallelToolCalls: true,
  
  // 可选：启用思考阶段
  enableThinkingPhase: true,
  
  // 可选：模式选择
  usePromptBasedTools: 'auto',
  
  // 可选：即时结果匹配器
  immediateResultMatchers: [
    { type: 'card' },
    { type: 'product_list' },
  ],
  
  // MCP 服务器配置
  mcpServers: {
    // stdio 模式 - 本地进程
    business: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-server.js'],
      env: { DEBUG: 'true' },
    },
    // SSE 模式 - 远程服务
    remote: {
      type: 'sse',
      url: 'http://localhost:8080/mcp',
      headers: { 'Authorization': 'Bearer token' },
    },
    // Streamable HTTP 模式
    streamable: {
      type: 'streamable-http',
      url: 'http://localhost:8080/mcp/stream',
      headers: { 'X-API-Key': 'key' },
    },
  },
})
```

### MCP 服务器配置

```typescript
// Stdio 模式（本地进程）
interface MCPServerConfigStdio {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// SSE 模式（远程服务）
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

## 🤖 多模型支持

MCPLink 会根据模型自动选择最佳的调用方式：

| 模型 | 模式 | 说明 |
|------|------|------|
| GPT-4o, GPT-4, GPT-3.5 | 原生 | 使用 function calling |
| Claude-3, Claude-3.5 | 原生 | 使用 function calling |
| Gemini Flash/Pro | 原生 | 使用 function calling |
| Mistral, Mixtral | 原生 | 使用 function calling |
| DeepSeek | Prompt-Based | 使用 prompt 引导 |
| Qwen, 通义千问 | Prompt-Based | 使用 prompt 引导 |
| Llama, Yi, GLM | Prompt-Based | 使用 prompt 引导 |

### OpenAI

```typescript
import { MCPLink, createOpenAI } from '@n0ts123/mcplink-core'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
const agent = new MCPLink({ model: openai('gpt-4o') })
```

### Anthropic Claude

```typescript
import { MCPLink, createAnthropic } from '@n0ts123/mcplink-core'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const agent = new MCPLink({ model: anthropic('claude-3-5-sonnet-20241022') })
```

### Google Gemini

> 需额外安装：`npm install @ai-sdk/google`

```typescript
import { MCPLink } from '@n0ts123/mcplink-core'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
const agent = new MCPLink({ model: google('gemini-1.5-flash') })
```

### DeepSeek / 通义千问

```typescript
import { MCPLink, createOpenAI } from '@n0ts123/mcplink-core'

// DeepSeek
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
})
const agent = new MCPLink({ model: deepseek('deepseek-chat') })

// 通义千问
const qwen = createOpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
})
const agent = new MCPLink({ model: qwen('qwen-plus') })
```

## 💬 多轮对话

```typescript
const history: Array<{ role: 'user' | 'assistant'; content: string }> = []

// 第一轮
let response = ''
for await (const event of agent.chatStream('帮我查订单')) {
  if (event.type === MCPLinkEventType.TEXT_DELTA) {
    response += event.data.content || ''
  }
}
history.push({ role: 'user', content: '帮我查订单' })
history.push({ role: 'assistant', content: response })

// 第二轮（携带历史）
for await (const event of agent.chatStream('第一个订单的详情', { history })) {
  // ...
}
```

## 🔧 工具过滤

```typescript
// 只允许使用特定工具
for await (const event of agent.chatStream('搜索产品', {
  allowedTools: ['search_products', 'get_product_details'],
})) {
  // 只会调用指定的工具
}
```

## 🎯 即时结果

当 MCP 工具返回特定格式数据时，可立即推送给前端：

```typescript
const agent = new MCPLink({
  model: openai('gpt-4o'),
  mcpServers: { /* ... */ },
  // 配置即时结果匹配器
  immediateResultMatchers: [
    { type: 'card' },           // 匹配 { type: "card", ... }
    { type: 'product_list' },   // 匹配 { type: "product_list", ... }
  ],
})

for await (const event of agent.chatStream('搜索产品')) {
  if (event.type === MCPLinkEventType.IMMEDIATE_RESULT) {
    // 立即展示卡片/特殊格式数据
    showCard(event.data.immediateResult)
  }
}
```

## 📋 事件类型

| 事件 | 说明 | 数据 |
|------|------|------|
| `iteration_start` | 迭代开始 | `{ iteration, maxIterations }` |
| `iteration_end` | 迭代结束 | `{ iteration }` |
| `thinking_start` | 思考开始 | `{}` |
| `thinking_delta` | 思考内容 | `{ content }` |
| `thinking_end` | 思考结束 | `{}` |
| `thinking_content` | 完整思考内容 | `{ content }` |
| `text_start` | 文本开始 | `{}` |
| `text_delta` | 文本内容 | `{ content }` |
| `text_end` | 文本结束 | `{}` |
| `tool_call_start` | 工具调用开始 | `{ toolName, toolCallId, toolArgs }` |
| `tool_call_delta` | 工具参数流式 | `{ toolCallId, argsTextDelta }` |
| `tool_executing` | 工具执行中 | `{ toolName, toolCallId, toolArgs }` |
| `tool_result` | 工具结果 | `{ toolName, toolResult, toolCallId, duration, isError }` |
| `immediate_result` | 即时结果 | `{ toolName, toolCallId, immediateResult }` |
| `complete` | 完成 | `{ totalDuration, totalIterations }` |
| `error` | 错误 | `{ error }` |

## 🔧 手动工具管理

```typescript
// 获取所有可用工具
const tools = agent.getTools()

// 手动调用工具
const result = await agent.callTool('search_products', { keyword: 'test' })

// 获取 MCP 服务器状态
const statuses = agent.getMCPServerStatuses()

// 手动控制 MCP 服务器
await agent.startMCPServer('myServer')
await agent.stopMCPServer('myServer')
```

## 📝 TypeScript 类型

```typescript
import type {
  MCPLinkConfig,
  MCPServerConfig,
  MCPServerConfigStdio,
  MCPServerConfigSSE,
  MCPServerConfigStreamableHTTP,
  MCPLinkEvent,
  MCPLinkEventData,
  MCPTool,
  MCPServerStatus,
  ChatResult,
  ChatCallbacks,
  ImmediateResultMatcher,
} from '@n0ts123/mcplink-core'

import { MCPLinkEventType } from '@n0ts123/mcplink-core'
```

## 📋 环境要求

- **Node.js**: >= 18.0.0
- **模块系统**: ES Module（推荐）或 CommonJS（需使用动态 import）

## 🔗 相关链接

- [GitHub 仓库](https://github.com/n0tssss/MCPLink)
- [完整文档](https://github.com/n0tssss/MCPLink#readme)
- [问题反馈](https://github.com/n0tssss/MCPLink/issues)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Vercel AI SDK](https://sdk.vercel.ai/)

## 📄 许可证

MIT License © [n0tssss](https://github.com/n0tssss)

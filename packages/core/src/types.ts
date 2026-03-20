/**
 * MCPLink 核心类型定义
 * 极简设计：只做 MCP + HTTP 桥接
 */

// ============ AI 请求配置 ============

/** AI 提供商适配器类型 */
export type AIAdapterType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom'

/** AI 请求配置 - 完全开放，任意参数 */
export interface AIRequestConfig {
  /** AI 服务地址 */
  baseURL: string
  /** API 密钥 */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 请求头（可选） */
  headers?: Record<string, string>
  /** 请求超时（毫秒，默认 120000） */
  timeout?: number
  /** 任意其他参数，原封不动传给 AI */
  [key: string]: unknown
}

/** AI 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** AI 消息 */
export interface Message {
  role: MessageRole
  content: string
  /** 工具调用（assistant 消息） */
  toolCalls?: ToolCall[]
  /** 工具结果（tool 消息） */
  toolResults?: ToolResult[]
}

/** 工具调用定义 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** 工具结果 */
export interface ToolResult {
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

/** AI 流式事件 */
export type AIStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'done' }
  | { type: 'error'; error: Error }

/** AI 响应（非流式） */
export interface AIResponse {
  content: string
  toolCalls?: ToolCall[]
}

/** 工具定义（传递给 AI 的函数定义） */
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** 适配器接口 - 用于转换不同 AI 提供商的格式 */
export interface AIAdapter {
  /** 适配器名称 */
  name: string
  /** 构建请求体 */
  buildRequestBody: (config: AIRequestConfig, messages: Message[], tools?: ToolDefinition[]) => unknown
  /** 获取请求头 */
  getHeaders: (config: AIRequestConfig) => Record<string, string>
  /** 获取请求端点 */
  getEndpoint: (baseURL: string) => string
  /** 解析非流式响应 */
  parseResponse: (data: unknown) => AIResponse
  /** 解析流式数据块（SSE） */
  parseStreamChunk: (line: string) => AIStreamEvent | null
}

/** 用户回调函数 - 处理 AI 响应 */
export interface AIResponseHandler {
  /**
   * 处理 AI 流式响应
   * @param event 流式事件
   * @returns 是否继续接收（返回 false 可中止）
   */
  onStream?: (event: AIStreamEvent) => boolean | void

  /**
   * 处理需要工具调用的请求
   * @param toolCalls 工具调用列表
   * @returns 工具执行结果（MCPLink 会自动执行 MCP 工具后再次调用 AI）
   */
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<ToolResult[]> | ToolResult[]
}

// ============ MCP 配置 ============

/** MCP 服务器配置 - stdio 模式 */
export interface MCPServerConfigStdio {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

/** MCP 服务器配置 - Streamable HTTP 模式 */
export interface MCPServerConfigStreamableHTTP {
  type: 'streamable-http'
  url: string
  headers?: Record<string, string>
}

/** MCP 服务器配置 */
export type MCPServerConfig = MCPServerConfigStdio | MCPServerConfigStreamableHTTP

/** MCP 工具定义 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** MCP 服务器状态 */
export interface MCPServerStatus {
  id: string
  name: string
  config: MCPServerConfig
  status: 'stopped' | 'starting' | 'running' | 'error'
  tools: MCPTool[]
  error?: string
}

// ============ MCPLink 配置 ============

/** MCPLink 配置 */
export interface MCPLinkConfig {
  /** AI 请求配置 */
  ai: AIRequestConfig
  /** 适配器类型或自定义适配器（默认 'openai'） */
  adapter?: AIAdapterType | AIAdapter
  /** MCP 服务器配置 */
  mcpServers?: Record<string, MCPServerConfig>
  /** 最大迭代次数（防止无限循环，默认 10） */
  maxIterations?: number
}

/** 对话选项 */
export interface ChatOptions {
  /** 消息历史 */
  messages: Message[]
  /** 可用工具 */
  tools?: ToolDefinition[]
  /** 流式处理回调 */
  onStream?: (event: AIStreamEvent) => boolean | void
  /** 是否启用流式（默认 true） */
  stream?: boolean
}

/** 对话结果 */
export interface ChatResult {
  content: string
  messages: Message[]
  iterations: number
  duration: number
}

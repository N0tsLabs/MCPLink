import type { LanguageModel } from 'ai'

// ============ 配置类型 ============

/** MCP 服务器配置 - stdio 模式 */
export interface MCPServerConfigStdio {
    type?: 'stdio'
    /** 启动命令 */
    command: string
    /** 命令参数 */
    args?: string[]
    /** 环境变量 */
    env?: Record<string, string>
}

/** MCP 服务器配置 - SSE 模式 */
export interface MCPServerConfigSSE {
    type: 'sse'
    /** SSE 服务地址 */
    url: string
    /** 请求头 */
    headers?: Record<string, string>
}

/** MCP 服务器配置 - Streamable HTTP 模式 */
export interface MCPServerConfigStreamableHTTP {
    type: 'streamable-http'
    /** HTTP 服务地址 */
    url: string
    /** 请求头 */
    headers?: Record<string, string>
}

/** MCP 服务器配置 */
export type MCPServerConfig = MCPServerConfigStdio | MCPServerConfigSSE | MCPServerConfigStreamableHTTP

/**
 * 即时结果匹配器
 * 用于检测 MCP 工具返回的特殊格式数据
 * 当工具返回的 JSON 包含匹配器中所有的 key-value 时，会立即发送 IMMEDIATE_RESULT 事件
 * 
 * @example
 * // 匹配包含 { type: "card" } 的返回结果
 * { type: "card" }
 * 
 * // 匹配包含 { type: "product_list", isCard: true } 的返回结果
 * { type: "product_list", isCard: true }
 */
export type ImmediateResultMatcher = Record<string, unknown>

/** MCPLink 配置 */
export interface MCPLinkConfig {
    /** AI 模型实例 (Vercel AI SDK) */
    model: LanguageModel
    /** 模型名称（用于自动检测是否支持原生工具调用） */
    modelName?: string
    /** MCP 服务器配置 */
    mcpServers?: Record<string, MCPServerConfig>
    /** 系统提示词 */
    systemPrompt?: string
    /** 最大迭代次数 (防止无限循环) */
    maxIterations?: number
    /** 是否允许并行工具调用 */
    parallelToolCalls?: boolean
    /**
     * 是否使用基于 Prompt 的工具调用
     * - true: 使用 prompt 让模型输出特定格式来调用工具（支持所有模型）
     * - false: 使用原生 function calling（需要模型支持）
     * - 'auto': 自动检测（默认）
     */
    usePromptBasedTools?: boolean | 'auto'
    /**
     * 即时结果匹配器列表
     * 当 MCP 工具返回的结果匹配任意一个匹配器时，会立即发送 IMMEDIATE_RESULT 事件
     * 匹配规则：结果 JSON 中包含匹配器的所有 key 且对应的 value 相等
     * 
     * @example
     * immediateResultMatchers: [
     *   { type: "card" },           // 匹配 { type: "card", ... }
     *   { type: "product_list" },   // 匹配 { type: "product_list", ... }
     * ]
     */
    immediateResultMatchers?: ImmediateResultMatcher[]
    /**
     * 是否启用思考阶段（两阶段调用）
     * - true: 每次迭代先让 AI 思考分析，再执行工具调用（默认，推荐）
     * - false: 直接调用 AI 并执行工具（更快但可能不够准确）
     * 
     * 启用后的流程：
     * 1. 思考阶段：AI 分析需求，输出思考过程，决定调用什么工具
     * 2. 执行阶段：根据思考结果执行工具调用
     * 
     * 优点：
     * - 任何模型都能看到思考过程
     * - Chain-of-Thought 效应，显著提高复杂任务准确性
     * 
     * 缺点：
     * - 每次迭代多一次 API 调用，增加延迟和成本
     * 
     * @default false
     */
    enableThinkingPhase?: boolean
    /**
     * 自定义思考阶段提示词
     * 用于引导 AI 在调用工具前进行分析
     * 
     * 如果不设置，使用默认提示词
     */
    thinkingPhasePrompt?: string
    /**
     * 思考阶段的最大 token 数
     * 用于限制思考输出长度，不设置则不限制
     */
    thinkingMaxTokens?: number
}

// ============ 消息类型 ============

/** 工具调用 */
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
    duration?: number
}

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** 消息 */
export interface Message {
    role: MessageRole
    content: string
    toolCalls?: ToolCall[]
    toolResults?: ToolResult[]
}

// ============ 事件类型 ============

/** 事件类型 */
export enum MCPLinkEventType {
    /** AI 开始思考 */
    THINKING_START = 'thinking_start',
    /** AI 思考内容 (流式) */
    THINKING_DELTA = 'thinking_delta',
    /** AI 思考结束 */
    THINKING_END = 'thinking_end',

    /** AI 开始回复 */
    TEXT_START = 'text_start',
    /** AI 回复内容 (流式) */
    TEXT_DELTA = 'text_delta',
    /** AI 回复结束 */
    TEXT_END = 'text_end',

    /** 开始调用工具 */
    TOOL_CALL_START = 'tool_call_start',
    /** 工具参数 (流式) */
    TOOL_CALL_DELTA = 'tool_call_delta',
    /** 工具正在执行 */
    TOOL_EXECUTING = 'tool_executing',
    /** 工具返回结果 */
    TOOL_RESULT = 'tool_result',
    /** 工具返回的即时结果（匹配 immediateResultMatchers 时触发） */
    IMMEDIATE_RESULT = 'immediate_result',

    /** 开始新一轮迭代 */
    ITERATION_START = 'iteration_start',
    /** 迭代结束 */
    ITERATION_END = 'iteration_end',

    /** 全部完成 */
    COMPLETE = 'complete',
    /** 发生错误 */
    ERROR = 'error',
}

/** 事件数据 */
export interface MCPLinkEventData {
    content?: string
    toolName?: string
    toolArgs?: Record<string, unknown>
    toolResult?: unknown
    toolCallId?: string
    duration?: number
    iteration?: number
    maxIterations?: number
    totalIterations?: number
    totalDuration?: number
    argsTextDelta?: string
    isError?: boolean
    error?: Error
    /** 即时结果数据（原封不动的工具返回结果） */
    immediateResult?: unknown
}

/** 事件 */
export interface MCPLinkEvent {
    type: MCPLinkEventType
    timestamp: number
    data: MCPLinkEventData
}

// ============ 回调类型 ============

/** 对话回调选项 */
export interface ChatCallbacks {
    /** AI 思考内容 */
    onThinking?: (content: string) => void
    /** 开始调用工具 */
    onToolCallStart?: (toolName: string, args: Record<string, unknown>) => void
    /** 工具返回结果 */
    onToolResult?: (toolName: string, result: unknown, duration: number) => void
    /** AI 输出文本 (流式) */
    onTextDelta?: (delta: string) => void
    /** 迭代开始 */
    onIterationStart?: (iteration: number) => void
    /** 迭代结束 */
    onIterationEnd?: (iteration: number) => void
    /** 发生错误 */
    onError?: (error: Error) => void
}

// ============ 返回类型 ============

/** 对话结果 */
export interface ChatResult {
    /** 最终回复内容 */
    content: string
    /** 执行过的工具调用记录 */
    toolCalls: Array<{
        name: string
        arguments: Record<string, unknown>
        result: unknown
        duration: number
    }>
    /** 完整消息历史 */
    messages: Message[]
    /** Token 使用量 */
    usage: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
    /** 总迭代次数 */
    iterations: number
    /** 总耗时 (ms) */
    duration: number
}

// ============ MCP 工具类型 ============

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

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

/** MCP 服务器配置 */
export type MCPServerConfig = MCPServerConfigStdio | MCPServerConfigSSE

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
    /** AI 思考内容（完整，用于工具调用时展示） */
    THINKING_CONTENT = 'thinking_content',

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
    /** 工具调用参数完成 */
    TOOL_CALL_END = 'tool_call_end',
    /** 工具正在执行 */
    TOOL_EXECUTING = 'tool_executing',
    /** 工具返回结果 */
    TOOL_RESULT = 'tool_result',

    /** 开始新一轮迭代 */
    ITERATION_START = 'iteration_start',
    /** 迭代结束 */
    ITERATION_END = 'iteration_end',

    /** 全部完成 */
    COMPLETE = 'complete',
    /** 发生错误 */
    ERROR = 'error',

    /** TODO 列表开始 */
    TODO_START = 'todo_start',
    /** 添加 TODO 项 */
    TODO_ITEM_ADD = 'todo_item_add',
    /** 更新 TODO 项状态 */
    TODO_ITEM_UPDATE = 'todo_item_update',
    /** TODO 列表完成 */
    TODO_END = 'todo_end',
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
    // TODO 相关
    todoId?: string
    todoTitle?: string
    todoItemId?: string
    todoItemContent?: string
    todoItemStatus?: TodoItemStatus
    todoItemResult?: string
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
    /** TODO 列表开始 */
    onTodoStart?: (todoId: string, title: string) => void
    /** TODO 项添加 */
    onTodoItemAdd?: (todoId: string, item: TodoItem) => void
    /** TODO 项更新 */
    onTodoItemUpdate?: (todoId: string, itemId: string, status: TodoItemStatus, result?: string) => void
    /** TODO 列表完成 */
    onTodoEnd?: (todoId: string) => void
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

// ============ TODO 任务类型 ============

/** TODO 项状态 */
export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/** TODO 项 */
export interface TodoItem {
    /** 唯一标识 */
    id: string
    /** 任务内容 */
    content: string
    /** 当前状态 */
    status: TodoItemStatus
    /** 完成后的结果摘要 */
    result?: string
}

/** TODO 列表 */
export interface TodoList {
    /** 唯一标识 */
    id: string
    /** 整体任务标题 */
    title: string
    /** 任务项列表 */
    items: TodoItem[]
    /** 创建时间 */
    createdAt: number
}

/** 模型配置（简化版 - 统一使用代理 URL） */
export interface Model {
    id: string
    /** 显示名称，如 "GPT-4o" */
    name: string
    /** 模型名称，如 "gpt-4o" */
    model: string
    /** 代理地址，如 "https://api.openai.com/v1" */
    baseURL: string
    /** API Key */
    apiKey: string
    /** 是否启用 */
    enabled: boolean
    /** 所属渠道 ID */
    channelId?: string
}

/** 模型渠道配置 */
export interface ModelChannel {
    id: string
    /** 渠道名称，如 "OpenAI", "Claude" */
    name: string
    /** 代理地址 */
    baseURL: string
    /** API Key */
    apiKey: string
    /** 渠道下的模型列表 */
    models: string[]
    /** 是否启用 */
    enabled: boolean
    /** 创建时间 */
    createdAt: number
}

/** MCP 服务器配置 */
export interface MCPServer {
    id: string
    name: string
    type: 'stdio' | 'sse'
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
    enabled: boolean
    autoStart: boolean
    status?: 'stopped' | 'starting' | 'running' | 'error'
    tools?: MCPTool[]
    /** 错误信息（启动失败时） */
    error?: string
}

/** MCP 工具 */
export interface MCPTool {
    name: string
    description: string
    inputSchema: {
        type: 'object'
        properties?: Record<string, unknown>
        required?: string[]
    }
}

/** 会话消息 */
export interface Message {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    toolCalls?: ToolCallRecord[]
    /** AI 思考过程 */
    thinking?: string
    /** 思考耗时（秒） */
    thinkingDuration?: number
}

/** 工具调用记录 */
export interface ToolCallRecord {
    name: string
    arguments: Record<string, unknown>
    result: unknown
    duration: number
    status?: 'pending' | 'executing' | 'success' | 'error'
}

/** 会话 */
export interface Conversation {
    id: string
    title: string
    modelId: string
    messages: Message[]
    createdAt: number
    updatedAt: number
}

/** 系统设置 */
export interface Settings {
    defaultModelId?: string
    systemPrompt?: string
    maxIterations?: number
    /** 是否使用基于 Prompt 的工具调用（支持所有模型） */
    usePromptBasedTools?: boolean
}

// ============ TODO 类型 ============

/** TODO 项状态 */
export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/** TODO 项 */
export interface TodoItem {
    id: string
    content: string
    status: TodoItemStatus
    result?: string
}

/** TODO 列表 */
export interface TodoList {
    id: string
    title: string
    items: TodoItem[]
}

/** SSE 事件类型 */
export type SSEEventType =
    | 'connected'
    | 'thinking_start'
    | 'thinking_delta'
    | 'thinking_end'
    | 'thinking_content'
    | 'text_start'
    | 'text_delta'
    | 'text_end'
    | 'tool_call_start'
    | 'tool_call_delta'
    | 'tool_call_end'
    | 'tool_executing'
    | 'tool_result'
    | 'iteration_start'
    | 'iteration_end'
    | 'todo_start'
    | 'todo_item_add'
    | 'todo_item_update'
    | 'todo_end'
    | 'complete'
    | 'error'

/** SSE 事件 */
export interface SSEEvent {
    type: SSEEventType
    data: {
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
        error?: string
        // TODO 相关
        todoId?: string
        todoTitle?: string
        todoItemId?: string
        todoItemContent?: string
        todoItemStatus?: TodoItemStatus
        todoItemResult?: string
    }
}

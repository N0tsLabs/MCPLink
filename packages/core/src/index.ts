// 主类
export { MCPLink } from './MCPLink.js'

// 管理器
export { MCPManager } from './MCPManager.js'

// Agent
export { Agent, DEFAULT_SYSTEM_PROMPT } from './Agent.js'
export { PromptBasedAgent } from './PromptBasedAgent.js'

// 类型导出
export type {
    // 配置类型
    MCPLinkConfig,
    MCPServerConfig,
    MCPServerConfigStdio,
    MCPServerConfigSSE,

    // 消息类型
    Message,
    MessageRole,
    ToolCall,
    ToolResult,

    // 事件类型
    MCPLinkEvent,
    MCPLinkEventData,

    // 回调类型
    ChatCallbacks,

    // 返回类型
    ChatResult,

    // MCP 类型
    MCPTool,
    MCPServerStatus,

    // TODO 类型
    TodoItem,
    TodoItemStatus,
    TodoList,
} from './types.js'

// 事件枚举
export { MCPLinkEventType } from './types.js'

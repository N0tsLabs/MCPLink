// 主类
export { MCPLink } from './MCPLink.js'

// 管理器
export { MCPManager } from './MCPManager.js'

// Agent
export { Agent, DEFAULT_SYSTEM_PROMPT, DEFAULT_THINKING_PHASE_PROMPT } from './Agent.js'
export { PromptBasedAgent } from './PromptBasedAgent.js'

// AI SDK 重新导出 - 方便用户一站式导入
export { createOpenAI } from '@ai-sdk/openai'
export { createAnthropic } from '@ai-sdk/anthropic'

// 类型导出
export type {
    // 配置类型
    MCPLinkConfig,
    MCPServerConfig,
    MCPServerConfigStdio,
    MCPServerConfigSSE,
    ImmediateResultMatcher,

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
} from './types.js'

// 事件枚举
export { MCPLinkEventType } from './types.js'

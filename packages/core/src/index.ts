// 主类
export { MCPLink } from './MCPLink.js'

// 管理器
export { MCPManager } from './MCPManager.js'

// HTTP 客户端
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

// 类型导出
export type {
    // 配置类型
    MCPLinkConfig,
    MCPServerConfig,
    MCPServerConfigStdio,
    MCPServerConfigStreamableHTTP,

    // AI 配置
    AIRequestConfig,
    AIAdapter,
    AIAdapterType,

    // 消息类型
    Message,
    MessageRole,
    ToolCall,
    ToolResult,
    ToolDefinition,

    // 流式事件
    AIStreamEvent,
    AIResponseHandler,

    // 对话选项和结果
    ChatOptions,
    ChatResult,

    // MCP 类型
    MCPTool,
    MCPServerStatus,
} from './types.js'

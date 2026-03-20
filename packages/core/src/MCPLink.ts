import type { MCPLinkConfig, ChatOptions, ChatResult, MCPServerConfig, MCPServerStatus, MCPTool, AIAdapter, AIStreamEvent, ToolCall, ToolResult, Message, ToolDefinition } from './types.js'
import { MCPManager } from './MCPManager.js'
import { HttpClient } from './http-client.js'
import { openaiAdapter } from './adapters/openai.js'

/**
 * MCPLink - 极简 MCP + AI HTTP 桥接
 *
 * 职责：
 * 1. 管理 MCP 服务器连接
 * 2. 发起 AI HTTP 请求
 * 3. 发现工具调用 → 执行 MCP 工具 → 回调结果
 *
 * 不职责：
 * 1. 不管理消息历史（用户自己维护）
 * 2. 不处理 AI 响应格式（用户通过 onStream 回调处理）
 * 3. 不做复杂的 Agent 循环（用户控制迭代）
 */
export class MCPLink {
  private config: MCPLinkConfig
  private mcpManager: MCPManager
  private httpClient: HttpClient
  private adapter: AIAdapter
  private initialized = false

  constructor(config: MCPLinkConfig) {
    this.config = config
    this.mcpManager = new MCPManager()
    this.httpClient = new HttpClient()

    // 设置适配器
    if (typeof config.adapter === 'string') {
      this.adapter = this.getAdapterByType(config.adapter)
    } else if (config.adapter) {
      this.adapter = config.adapter
    } else {
      this.adapter = openaiAdapter
    }

    // 添加 MCP 服务器
    if (config.mcpServers) {
      for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
        this.mcpManager.addServer(id, serverConfig)
      }
    }
  }

  /**
   * 初始化 - 连接所有 MCP 服务器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.mcpManager.startAll()
    this.initialized = true
  }

  /**
   * 关闭 - 断开所有 MCP 服务器连接
   */
  async close(): Promise<void> {
    await this.mcpManager.stopAll()
    this.initialized = false
  }

  /**
   * 对话 - 极简设计
   *
   * 流程：
   * 1. 发送消息给 AI
   * 2. AI 返回文本/工具调用
   * 3. 如果有工具调用，执行 MCP 工具
   * 4. 返回结果（包括新的消息历史，用户可选择是否继续）
   *
   * 用户需要自己：
   * - 维护 messages 历史
   * - 处理流式响应（通过 onStream）
   * - 决定是否继续迭代（如果返回了 toolCalls）
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.initialized) {
      await this.initialize()
    }

    const startTime = Date.now()
    const maxIterations = this.config.maxIterations ?? 10
    let iterations = 0
    let messages = [...options.messages]

    // 获取 MCP 工具
    const mcpTools = this.mcpManager.getAllTools()
    const tools: ToolDefinition[] = mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as ToolDefinition['parameters'],
    }))

    while (iterations < maxIterations) {
      iterations++

      // 调用 AI
      const response = options.stream !== false
        ? await this.streamChat(messages, tools, options.onStream)
        : await this.singleChat(messages, tools)

      // 如果没有工具调用，直接返回
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // 添加 assistant 消息到历史
        messages.push({
          role: 'assistant',
          content: response.content,
        })

        return {
          content: response.content,
          messages,
          iterations,
          duration: Date.now() - startTime,
        }
      }

      // 有工具调用，执行 MCP 工具
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      }

      const toolResults: ToolResult[] = []

      for (const tc of response.toolCalls) {
        let result: unknown
        let isError = false

        try {
          result = await this.mcpManager.callTool(tc.name, tc.arguments)
        } catch (error) {
          result = error instanceof Error ? error.message : String(error)
          isError = true
        }

        toolResults.push({
          toolCallId: tc.id,
          toolName: tc.name,
          result,
          isError,
        })
      }

      // 添加 assistant 和 tool 消息到历史
      messages.push(assistantMessage)
      messages.push({
        role: 'tool',
        content: '',
        toolResults,
      })

      // 如果用户提供了 onToolCalls 回调，让用户决定是否继续
      // 否则自动继续（下一轮 AI 调用）
    }

    // 达到最大迭代次数
    return {
      content: messages[messages.length - 1]?.content || '',
      messages,
      iterations,
      duration: Date.now() - startTime,
    }
  }

  /**
   * 单次 AI 调用（非流式）
   */
  private async singleChat(
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const response = await this.httpClient.chat(
      this.config.ai,
      this.adapter,
      messages,
      tools
    )

    return {
      content: response.content,
      toolCalls: response.toolCalls,
    }
  }

  /**
   * 流式 AI 调用
   */
  private async streamChat(
    messages: Message[],
    tools?: ToolDefinition[],
    onStream?: (event: AIStreamEvent) => boolean | void
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    let content = ''
    const toolCalls: ToolCall[] = []

    for await (const event of this.httpClient.streamChat(
      this.config.ai,
      this.adapter,
      messages,
      tools
    )) {
      // 调用用户回调
      const shouldContinue = onStream?.(event)
      if (shouldContinue === false) {
        break
      }

      switch (event.type) {
        case 'text':
          content += event.content
          break
        case 'tool_call':
          toolCalls.push(event.toolCall)
          break
        case 'error':
          throw event.error
      }
    }

    return {
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    }
  }

  /**
   * 流式对话 - 公共方法
   * 直接发起流式请求并返回结果
   */
  async chatStream(
    messages: Message[],
    onStream?: (event: AIStreamEvent) => boolean | void
  ): Promise<ChatResult> {
    if (!this.initialized) {
      await this.initialize()
    }

    const startTime = Date.now()

    // 获取 MCP 工具
    const mcpTools = this.mcpManager.getAllTools()
    const tools: ToolDefinition[] = mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as ToolDefinition['parameters'],
    }))

    // 流式调用
    const response = await this.streamChat(messages, tools, onStream)

    // 如果有工具调用，执行它们并返回结果
    if (response.toolCalls && response.toolCalls.length > 0) {
      // 执行工具调用
      const toolResults: ToolResult[] = []

      for (const tc of response.toolCalls) {
        let result: unknown
        let isError = false

        try {
          result = await this.mcpManager.callTool(tc.name, tc.arguments)
        } catch (error) {
          result = error instanceof Error ? error.message : String(error)
          isError = true
        }

        toolResults.push({
          toolCallId: tc.id,
          toolName: tc.name,
          result,
          isError,
        })
      }

      // 添加 assistant 和 tool 消息到历史
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      }

      messages.push(assistantMessage)
      messages.push({
        role: 'tool',
        content: '',
        toolResults,
      })

      return {
        content: response.content,
        messages,
        iterations: 1,
        duration: Date.now() - startTime,
      }
    }

    // 没有工具调用，直接返回
    messages.push({
      role: 'assistant',
      content: response.content,
    })

    return {
      content: response.content,
      messages,
      iterations: 1,
      duration: Date.now() - startTime,
    }
  }

  /**
   * 根据类型获取适配器
   */
  private getAdapterByType(type: string): AIAdapter {
    switch (type) {
      case 'openai':
        return openaiAdapter
      default:
        throw new Error(`Unknown adapter type: ${type}`)
    }
  }

  // ============ MCP 服务器管理 ============

  addMCPServer(id: string, config: MCPServerConfig): void {
    this.mcpManager.addServer(id, config)
  }

  async removeMCPServer(id: string): Promise<void> {
    await this.mcpManager.removeServer(id)
  }

  async startMCPServer(id: string): Promise<void> {
    await this.mcpManager.startServer(id)
  }

  async stopMCPServer(id: string): Promise<void> {
    await this.mcpManager.stopServer(id)
  }

  getMCPServerStatuses(): MCPServerStatus[] {
    return this.mcpManager.getServerStatuses()
  }

  getTools(): MCPTool[] {
    return this.mcpManager.getAllTools()
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.mcpManager.callTool(toolName, args)
  }
}

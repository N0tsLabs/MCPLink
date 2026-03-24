/**
 * OpenAI 适配器
 * 支持任意自定义参数（如 enable_thinking）
 */

import type { AIAdapter, AIRequestConfig, AIResponse, AIStreamEvent, Message, ToolDefinition, ToolCall } from '../types.js'

export class OpenAIAdapter implements AIAdapter {
  name = 'openai'

  // 用于累积 tool_call 参数的状态
  private pendingToolCall: { id: string; name: string; arguments: string } | null = null

  /**
   * 检查 tool_call 参数是否完整（可以解析为 JSON）
   */
  private isToolCallComplete(tc: { arguments: string }): boolean {
    if (!tc.arguments) return false
    try {
      JSON.parse(tc.arguments)
      return true
    } catch {
      return false
    }
  }

  /**
   * 返回并清空 pending tool_call
   */
  private flushPendingToolCall(): AIStreamEvent | null {
    if (!this.pendingToolCall) return null
    const tc = this.pendingToolCall
    this.pendingToolCall = null
    return {
      type: 'tool_call',
      toolCall: {
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
      },
    }
  }

  /**
   * 构建请求体
   * 完全开放：除必要字段外，其他参数原封不动传递
   */
  buildRequestBody(
    config: AIRequestConfig,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Record<string, unknown> {
    // 提取标准参数
    const { baseURL, apiKey, model, headers, timeout, ...customParams } = config

    // 转换消息格式
    const openaiMessages = messages.map(msg => this.convertMessage(msg))

    // 转换工具格式
    const openaiTools = tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))

    // 构建请求体：标准参数 + 自定义参数（自定义参数可以覆盖标准参数）
    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      // 用户自定义参数（包括 enable_thinking 等）
      ...customParams,
    }

    // 如果有工具，添加工具配置
    if (openaiTools && openaiTools.length > 0) {
      body.tools = openaiTools
    }

    return body
  }

  /**
   * 获取请求头
   */
  getHeaders(config: AIRequestConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    }
  }

  /**
   * 获取请求端点
   */
  getEndpoint(baseURL: string): string {
    const normalized = baseURL.replace(/\/$/, '')
    return `${normalized}/chat/completions`
  }

  /**
   * 解析非流式响应
   */
  parseResponse(data: unknown): AIResponse {
    const response = data as {
      choices: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{
            id: string
            function: {
              name: string
              arguments: string
            }
          }>
        }
      }>
    }

    const choice = response.choices[0]
    const message = choice?.message

    // 解析工具调用
    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }))

    return {
      content: message?.content || '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
    }
  }

  /**
   * 解析流式数据块
   */
  parseStreamChunk(line: string): AIStreamEvent | null {
    try {
      const data = JSON.parse(line) as {
        choices: Array<{
          delta: {
            content?: string
            tool_calls?: Array<{
              index: number
              id?: string
              function?: {
                name?: string
                arguments?: string
              }
            }>
          }
          finish_reason: string | null
        }>
      }

      const choice = data.choices[0]
      const delta = choice?.delta

      // 文本内容
      if (delta?.content) {
        return { type: 'text', content: delta.content }
      }

      // 工具调用（支持参数累积，处理分片的 tool_call）
      if (delta?.tool_calls) {
        const tc = delta.tool_calls[0]
        // 新的 tool_call（没有 pending 或 id 不同）
        if (tc.id && tc.function?.name && (!this.pendingToolCall || this.pendingToolCall.id !== tc.id)) {
          const result = this.flushPendingToolCall()
          this.pendingToolCall = {
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments || ''
          }
          if (this.isToolCallComplete(this.pendingToolCall)) {
            return this.flushPendingToolCall()
          }
          return result
        }
        // 累积参数（同一个 tool_call 的后续 delta）
        if (this.pendingToolCall && tc.function?.arguments) {
          this.pendingToolCall.arguments += tc.function.arguments
          if (this.isToolCallComplete(this.pendingToolCall)) {
            return this.flushPendingToolCall()
          }
        }
      }
      // finish_reason 且有 pendingToolCall，强制完成
      if (choice?.finish_reason && this.pendingToolCall) {
        return this.flushPendingToolCall()
      }

      // 完成
      if (choice?.finish_reason) {
        return { type: 'done' }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * 转换消息格式
   */
  private convertMessage(msg: Message): Record<string, unknown> {
    // 系统/用户/assistant 消息
    if (msg.role !== 'tool') {
      const result: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      }

      // assistant 消息可能包含 tool_calls
      if (msg.role === 'assistant' && msg.toolCalls) {
        result.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))
      }

      return result
    }

    // tool 消息转换为 function 角色
    if (msg.toolResults && msg.toolResults.length > 0) {
      const tr = msg.toolResults[0]
      return {
        role: 'tool',
        tool_call_id: tr.toolCallId,
        content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
      }
    }

    return {
      role: 'user',
      content: msg.content,
    }
  }
}

/** OpenAI 适配器实例 */
export const openaiAdapter = new OpenAIAdapter()

/**
 * HTTP 客户端 - 基于 axios
 * 支持 SSE 流式响应
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { AIRequestConfig, AIResponse, AIStreamEvent, Message, ToolDefinition, AIAdapter } from './types.js'

export class HttpClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      timeout: 120000,
    })
  }

  /**
   * 非流式请求
   */
  async chat(
    aiConfig: AIRequestConfig,
    adapter: AIAdapter,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const body = adapter.buildRequestBody(aiConfig, messages, tools)
    const headers = { ...adapter.getHeaders(aiConfig), ...aiConfig.headers }

    const response = await this.client.post(
      adapter.getEndpoint(aiConfig.baseURL),
      body,
      {
        headers,
        timeout: aiConfig.timeout || 120000,
      }
    )

    return adapter.parseResponse(response.data)
  }

  /**
   * 流式请求 - SSE
   */
  async *streamChat(
    aiConfig: AIRequestConfig,
    adapter: AIAdapter,
    messages: Message[],
    tools?: ToolDefinition[]
  ): AsyncGenerator<AIStreamEvent> {
    const body = adapter.buildRequestBody(aiConfig, messages, tools)
    // 添加流式标记（适配器处理）
    const streamBody = { ...body as Record<string, unknown>, stream: true }
    const headers = { ...adapter.getHeaders(aiConfig), ...aiConfig.headers }

    const response = await this.client.post(
      adapter.getEndpoint(aiConfig.baseURL),
      streamBody,
      {
        headers,
        timeout: aiConfig.timeout || 120000,
        responseType: 'stream',
      }
    )

    const stream = response.data as NodeJS.ReadableStream

    for await (const event of this.parseSSE(stream)) {
      const parsed = adapter.parseStreamChunk(event)
      if (parsed) {
        yield parsed
      }
    }
  }

  /**
   * 解析 SSE 流
   */
  private async *parseSSE(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
    let buffer = ''

    for await (const chunk of stream) {
      buffer += chunk.toString()

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            return
          }
          if (data) {
            yield data
          }
        }
      }
    }

    // 处理剩余内容
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6)
      if (data && data !== '[DONE]') {
        yield data
      }
    }
  }
}

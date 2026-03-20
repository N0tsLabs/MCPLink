/**
 * 标准事件流转换器
 * 将底层 AI 事件转换为完整的标准事件流
 * 用户可选择使用底层事件或标准事件
 */

import type { AIStreamEvent, ToolCall } from './types.js'

/** 标准流式事件类型 */
export type StandardStreamEvent =
  | { type: 'text_start' }
  | { type: 'text_delta'; content: string }
  | { type: 'text_end' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end' }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string; toolArgs: Record<string, unknown> }
  | { type: 'tool_call_delta'; toolCallId: string; argsTextDelta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'tool_executing'; toolCallId: string; toolName: string }
  | { type: 'tool_result'; toolCallId: string; toolName: string; toolResult: unknown; duration: number; isError?: boolean }
  | { type: 'iteration_start'; iteration: number; maxIterations: number }
  | { type: 'iteration_end'; iteration: number }
  | { type: 'complete'; totalIterations: number; totalDuration: number }
  | { type: 'error'; error: Error }

/**
 * 标准事件流生成器选项
 */
export interface StandardStreamOptions {
  /** 最大迭代次数 */
  maxIterations?: number
  /** 工具执行函数 */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /** 底层事件回调（可选，用于自定义处理） */
  onRawEvent?: (event: AIStreamEvent) => boolean | void
}

/**
 * 将底层事件流转换为标准事件流
 */
export async function* toStandardStream(
  rawStream: AsyncGenerator<AIStreamEvent>,
  options: StandardStreamOptions
): AsyncGenerator<StandardStreamEvent> {
  let iteration = 0
  const maxIterations = options.maxIterations ?? 10
  const startTime = Date.now()
  let hasTextStarted = false

  // 跟踪工具调用状态
  const pendingToolCalls = new Map<string, ToolCall & { argsBuffer: string }>()

  for await (const event of rawStream) {
    // 调用原始事件回调
    const shouldContinue = options.onRawEvent?.(event)
    if (shouldContinue === false) break

    switch (event.type) {
      case 'text':
        if (!hasTextStarted) {
          hasTextStarted = true
          yield { type: 'text_start' }
        }
        if (event.content) {
          yield { type: 'text_delta', content: event.content }
        }
        break

      case 'tool_call': {
        // 发送 text_end（如果有文本）
        if (hasTextStarted) {
          hasTextStarted = false
          yield { type: 'text_end' }
        }

        const tc = event.toolCall
        pendingToolCalls.set(tc.id, { ...tc, argsBuffer: '' })

        yield {
          type: 'tool_call_start',
          toolCallId: tc.id,
          toolName: tc.name,
          toolArgs: tc.arguments,
        }

        yield {
          type: 'tool_executing',
          toolCallId: tc.id,
          toolName: tc.name,
        }

        // 执行工具
        const toolStartTime = Date.now()
        let result: unknown
        let isError = false

        try {
          result = await options.executeTool(tc.name, tc.arguments)
        } catch (error) {
          result = error instanceof Error ? error.message : String(error)
          isError = true
        }

        const duration = Date.now() - toolStartTime

        yield {
          type: 'tool_result',
          toolCallId: tc.id,
          toolName: tc.name,
          toolResult: result,
          duration,
          isError,
        }

        pendingToolCalls.delete(tc.id)
        break
      }

      case 'done':
        // 发送 text_end（如果有文本）
        if (hasTextStarted) {
          hasTextStarted = false
          yield { type: 'text_end' }
        }
        break

      case 'error':
        yield { type: 'error', error: event.error }
        return
    }
  }

  // 确保发送 text_end
  if (hasTextStarted) {
    yield { type: 'text_end' }
  }

  // 发送完成事件
  yield {
    type: 'complete',
    totalIterations: iteration,
    totalDuration: Date.now() - startTime,
  }
}

/**
 * 标准响应处理器 - 非流式
 * 收集完整响应内容
 */
export interface StandardResponse {
  content: string
  toolCalls: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: unknown
    duration?: number
    isError?: boolean
  }>
  iterations: number
  duration: number
}

/**
 * 从标准事件流收集完整响应
 */
export async function collectStandardResponse(
  stream: AsyncGenerator<StandardStreamEvent>
): Promise<StandardResponse> {
  const response: StandardResponse = {
    content: '',
    toolCalls: [],
    iterations: 0,
    duration: 0,
  }

  const toolCallMap = new Map<string, StandardResponse['toolCalls'][0]>()

  for await (const event of stream) {
    switch (event.type) {
      case 'text_delta':
        response.content += event.content
        break

      case 'tool_call_start': {
        const tc = {
          id: event.toolCallId,
          name: event.toolName,
          arguments: event.toolArgs,
        }
        response.toolCalls.push(tc)
        toolCallMap.set(event.toolCallId, tc)
        break
      }

      case 'tool_result': {
        const tc = toolCallMap.get(event.toolCallId)
        if (tc) {
          tc.result = event.toolResult
          tc.duration = event.duration
          tc.isError = event.isError
        }
        break
      }

      case 'complete':
        response.iterations = event.totalIterations
        response.duration = event.totalDuration
        break
    }
  }

  return response
}

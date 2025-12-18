import { generateText, streamText, type LanguageModel, type CoreMessage, type CoreTool } from 'ai'
import { z } from 'zod'
import type { MCPManager } from './MCPManager.js'
import {
    MCPLinkEventType,
    type MCPTool,
    type ChatCallbacks,
    type ChatResult,
    type MCPLinkEvent,
    type ToolResult,
} from './types.js'

/** 默认系统提示词 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，可以通过调用工具来帮助用户完成任务。

## 语言要求

**重要：你必须始终使用中文与用户沟通。** 无论工具返回的结果是什么语言，你都需要用中文进行总结和回复。

## 思考过程

在执行任务之前，请先在 <think> 标签内进行思考和分析：

<think>
1. 分析用户的真实需求
2. 考虑可能的解决方案
3. 决定是否需要使用工具
4. 规划执行步骤
</think>

**重要：每次回复前都应该先进行思考。** 思考过程有助于你更好地理解和解决问题。

## 任务规划（TODO）

对于复杂任务，你可以创建任务规划来有序地完成工作：

**何时创建 TODO：**
- 需要调用多个工具的复杂任务
- 涉及多个步骤的操作流程
- 用户明确要求多步骤执行的任务

**简单任务不需要 TODO：**
- 单次工具调用即可完成的简单任务
- 直接回答问题
- 简单的信息查询

## 工作方式

1. **思考分析**：使用 <think> 标签分析用户需求
2. **评估复杂度**：判断是否需要创建 TODO 任务规划
3. **规划步骤**：如果需要，创建清晰的任务步骤
4. **逐步执行**：每次选择最合适的工具，执行一个步骤
5. **更新进度**：完成每个步骤后更新 TODO 状态
6. **检查结果**：分析工具返回的结果，判断是否成功
7. **继续或完成**：如果还有未完成的步骤，继续执行；否则用中文总结结果回复用户

## 注意事项

- 每次回复前先用 <think> 标签进行思考
- 每次只调用必要的工具，不要过度调用
- 如果工具调用失败，分析原因并尝试其他方案
- 如果无法完成任务，诚实告知用户原因
- 完成所有步骤后，用清晰的中文语言总结执行结果
- 记住：所有回复必须使用中文`

/**
 * Agent 引擎
 * 负责执行 AI 对话循环，处理工具调用
 */
export class Agent {
    private model: LanguageModel
    private mcpManager: MCPManager
    private systemPrompt: string
    private maxIterations: number

    constructor(
        model: LanguageModel,
        mcpManager: MCPManager,
        options: {
            systemPrompt?: string
            maxIterations?: number
        } = {}
    ) {
        this.model = model
        this.mcpManager = mcpManager
        this.systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT
        this.maxIterations = options.maxIterations || 10
    }

    /**
     * 将 MCP 工具转换为 Vercel AI SDK 格式
     */
    private convertMCPToolsToAITools(mcpTools: MCPTool[]): Record<string, CoreTool> {
        const tools: Record<string, CoreTool> = {}

        for (const mcpTool of mcpTools) {
            // 将 JSON Schema 转换为 Zod Schema
            const zodSchema = this.jsonSchemaToZod(mcpTool.inputSchema)

            tools[mcpTool.name] = {
                description: mcpTool.description,
                parameters: zodSchema,
            }
        }

        return tools
    }

    /**
     * 简单的 JSON Schema 到 Zod 转换
     */
    private jsonSchemaToZod(schema: MCPTool['inputSchema']): z.ZodType {
        if (!schema.properties) {
            return z.object({})
        }

        const shape: Record<string, z.ZodType> = {}
        const required = schema.required || []

        for (const [key, prop] of Object.entries(schema.properties)) {
            const propSchema = prop as { type?: string; description?: string; items?: { type?: string } }
            let zodType: z.ZodType

            switch (propSchema.type) {
                case 'string':
                    zodType = z.string()
                    break
                case 'number':
                    zodType = z.number()
                    break
                case 'integer':
                    zodType = z.number().int()
                    break
                case 'boolean':
                    zodType = z.boolean()
                    break
                case 'array':
                    if (propSchema.items?.type === 'string') {
                        zodType = z.array(z.string())
                    } else if (propSchema.items?.type === 'number') {
                        zodType = z.array(z.number())
                    } else {
                        zodType = z.array(z.unknown())
                    }
                    break
                default:
                    zodType = z.unknown()
            }

            if (propSchema.description) {
                zodType = zodType.describe(propSchema.description)
            }

            if (!required.includes(key)) {
                zodType = zodType.optional()
            }

            shape[key] = zodType
        }

        return z.object(shape)
    }

    /**
     * 执行对话
     */
    async chat(userMessage: string, callbacks?: ChatCallbacks): Promise<ChatResult> {
        const startTime = Date.now()
        const toolCallRecords: ChatResult['toolCalls'] = []
        let totalPromptTokens = 0
        let totalCompletionTokens = 0

        // 构建消息历史
        const messages: CoreMessage[] = [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userMessage },
        ]

        // 获取所有可用工具
        const mcpTools = this.mcpManager.getAllTools()
        const tools = this.convertMCPToolsToAITools(mcpTools)

        let iteration = 0
        let finalContent = ''

        while (iteration < this.maxIterations) {
            iteration++
            callbacks?.onIterationStart?.(iteration)

            // 调用 AI
            const response = await generateText({
                model: this.model,
                messages,
                tools: Object.keys(tools).length > 0 ? tools : undefined,
                maxSteps: 1, // 每次只执行一步，方便我们控制流程
            })

            // 累计 token 使用
            if (response.usage) {
                totalPromptTokens += response.usage.promptTokens
                totalCompletionTokens += response.usage.completionTokens
            }

            // 检查是否有工具调用
            const toolCalls = response.toolCalls || []

            if (toolCalls.length === 0) {
                // 没有工具调用，说明 AI 完成了任务
                finalContent = response.text || ''
                callbacks?.onTextDelta?.(finalContent)
                callbacks?.onIterationEnd?.(iteration)
                break
            }

            // 有工具调用，处理它们
            const toolResults: ToolResult[] = []

            for (const toolCall of toolCalls) {
                const toolName = toolCall.toolName
                const toolArgs = toolCall.args as Record<string, unknown>
                const toolCallId = toolCall.toolCallId

                callbacks?.onToolCallStart?.(toolName, toolArgs)

                const toolStartTime = Date.now()
                let result: unknown
                let isError = false

                try {
                    result = await this.mcpManager.callTool(toolName, toolArgs)
                } catch (error) {
                    result = error instanceof Error ? error.message : String(error)
                    isError = true
                }

                const duration = Date.now() - toolStartTime

                callbacks?.onToolResult?.(toolName, result, duration)

                toolResults.push({
                    toolCallId,
                    toolName,
                    result,
                    isError,
                    duration,
                })

                toolCallRecords.push({
                    name: toolName,
                    arguments: toolArgs,
                    result,
                    duration,
                })
            }

            // 将 AI 的回复和工具调用添加到消息历史
            messages.push({
                role: 'assistant' as const,
                content: [
                    { type: 'text' as const, text: response.text || '' },
                    ...toolCalls.map((tc) => ({
                        type: 'tool-call' as const,
                        toolCallId: tc.toolCallId,
                        toolName: tc.toolName,
                        args: tc.args as Record<string, unknown>,
                    })),
                ],
            })

            // 将工具结果添加到消息历史
            for (const tr of toolResults) {
                messages.push({
                    role: 'tool' as const,
                    content: [
                        {
                            type: 'tool-result' as const,
                            toolCallId: tr.toolCallId,
                            toolName: tr.toolName,
                            result: tr.result,
                        },
                    ],
                })
            }

            callbacks?.onIterationEnd?.(iteration)
        }

        const duration = Date.now() - startTime

        return {
            content: finalContent,
            toolCalls: toolCallRecords,
            messages: messages.map((m) => ({
                role: m.role as 'system' | 'user' | 'assistant' | 'tool',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalPromptTokens + totalCompletionTokens,
            },
            iterations: iteration,
            duration,
        }
    }

    /**
     * 流式对话 - 返回事件生成器
     * @param userMessage 用户消息
     * @param options 可选参数
     * @param options.allowedTools 允许使用的工具名称列表，为空或不传则使用所有工具
     * @param options.history 历史消息列表
     */
    async *chatStream(
        userMessage: string,
        options?: {
            allowedTools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
    ): AsyncGenerator<MCPLinkEvent> {
        const startTime = Date.now()
        const toolCallRecords: ChatResult['toolCalls'] = []

        // 构建消息历史
        const messages: CoreMessage[] = [{ role: 'system', content: this.systemPrompt }]

        // 添加历史消息
        if (options?.history && options.history.length > 0) {
            for (const msg of options.history) {
                messages.push({
                    role: msg.role,
                    content: msg.content,
                })
            }
        }

        // 添加当前用户消息
        messages.push({ role: 'user', content: userMessage })

        // 获取所有可用工具
        let mcpTools = this.mcpManager.getAllTools()

        // 如果指定了允许的工具列表，则进行过滤
        if (options?.allowedTools && options.allowedTools.length > 0) {
            mcpTools = mcpTools.filter((tool) => options.allowedTools!.includes(tool.name))
        }

        const tools = this.convertMCPToolsToAITools(mcpTools)
        const hasTools = Object.keys(tools).length > 0

        let iteration = 0

        while (iteration < this.maxIterations) {
            iteration++

            yield {
                type: MCPLinkEventType.ITERATION_START,
                timestamp: Date.now(),
                data: { iteration, maxIterations: this.maxIterations },
            }

            // 使用 streamText 进行流式调用
            const stream = streamText({
                model: this.model,
                messages,
                tools: hasTools ? tools : undefined,
                maxSteps: 1,
            })

            // 收集流式结果
            let fullText = ''
            let reasoningText = ''
            const toolCalls: Array<{
                toolCallId: string
                toolName: string
                args: Record<string, unknown>
            }> = []
            let currentToolCall: {
                toolCallId: string
                toolName: string
                argsText: string
            } | null = null
            let hasStartedText = false
            let hasStartedReasoning = false

            // 已发送 TOOL_CALL_START 的工具 ID 集合
            const sentToolCallStarts = new Set<string>()

            // 用于解析 <think> 标签的状态
            let thinkBuffer = ''
            let isInsideThinkTag = false
            let textBuffer = ''

            // 流式处理
            for await (const chunk of stream.fullStream) {
                switch (chunk.type) {
                    case 'reasoning':
                        // 流式输出思考过程（Claude 等模型支持）
                        if (!hasStartedReasoning) {
                            hasStartedReasoning = true
                            yield {
                                type: MCPLinkEventType.THINKING_START,
                                timestamp: Date.now(),
                                data: {},
                            }
                        }
                        reasoningText += chunk.textDelta
                        yield {
                            type: MCPLinkEventType.THINKING_DELTA,
                            timestamp: Date.now(),
                            data: { content: chunk.textDelta },
                        }
                        break

                    case 'text-delta':
                        // 流式输出文本 - 解析 <think> 标签
                        const delta = chunk.textDelta
                        textBuffer += delta

                        // 处理 <think> 标签的开始
                        if (!isInsideThinkTag) {
                            // 检查是否有 <think> 开始标签
                            const thinkStartMatch = textBuffer.match(/<think>/i)
                            if (thinkStartMatch) {
                                // 发送标签之前的文本
                                const beforeThink = textBuffer.substring(0, thinkStartMatch.index)
                                if (beforeThink.trim()) {
                                    if (!hasStartedText) {
                                        hasStartedText = true
                                        yield {
                                            type: MCPLinkEventType.TEXT_START,
                                            timestamp: Date.now(),
                                            data: {},
                                        }
                                    }
                                    fullText += beforeThink
                                    yield {
                                        type: MCPLinkEventType.TEXT_DELTA,
                                        timestamp: Date.now(),
                                        data: { content: beforeThink },
                                    }
                                }
                                // 进入思考模式
                                isInsideThinkTag = true
                                if (!hasStartedReasoning) {
                                    hasStartedReasoning = true
                                    yield {
                                        type: MCPLinkEventType.THINKING_START,
                                        timestamp: Date.now(),
                                        data: {},
                                    }
                                }
                                textBuffer = textBuffer.substring(thinkStartMatch.index! + 7) // 跳过 <think>
                                thinkBuffer = ''
                            } else if (!textBuffer.includes('<')) {
                                // 没有潜在的标签，直接输出
                                if (hasStartedReasoning && !hasStartedText) {
                                    yield {
                                        type: MCPLinkEventType.THINKING_END,
                                        timestamp: Date.now(),
                                        data: {},
                                    }
                                }
                                if (!hasStartedText) {
                                    hasStartedText = true
                                    yield {
                                        type: MCPLinkEventType.TEXT_START,
                                        timestamp: Date.now(),
                                        data: {},
                                    }
                                }
                                fullText += textBuffer
                                yield {
                                    type: MCPLinkEventType.TEXT_DELTA,
                                    timestamp: Date.now(),
                                    data: { content: textBuffer },
                                }
                                textBuffer = ''
                            }
                            // 如果包含 '<' 但不是完整标签，继续缓冲
                        } else {
                            // 在思考标签内，检查结束标签
                            const thinkEndMatch = textBuffer.match(/<\/think>/i)
                            if (thinkEndMatch) {
                                // 发送结束前的思考内容
                                const thinkContent = textBuffer.substring(0, thinkEndMatch.index)
                                if (thinkContent) {
                                    thinkBuffer += thinkContent
                                    reasoningText += thinkContent
                                    yield {
                                        type: MCPLinkEventType.THINKING_DELTA,
                                        timestamp: Date.now(),
                                        data: { content: thinkContent },
                                    }
                                }
                                // 结束思考
                                yield {
                                    type: MCPLinkEventType.THINKING_END,
                                    timestamp: Date.now(),
                                    data: {},
                                }
                                isInsideThinkTag = false
                                textBuffer = textBuffer.substring(thinkEndMatch.index! + 8) // 跳过 </think>
                            } else if (!textBuffer.includes('<')) {
                                // 没有潜在的结束标签，直接输出思考内容
                                thinkBuffer += textBuffer
                                reasoningText += textBuffer
                                yield {
                                    type: MCPLinkEventType.THINKING_DELTA,
                                    timestamp: Date.now(),
                                    data: { content: textBuffer },
                                }
                                textBuffer = ''
                            }
                            // 如果包含 '<' 但不是完整标签，继续缓冲
                        }
                        break

                    case 'tool-call':
                        // 非流式工具调用（大多数模型使用这种方式）
                        // 直接发送完整的工具调用信息
                        if (!sentToolCallStarts.has(chunk.toolCallId)) {
                            yield {
                                type: MCPLinkEventType.TOOL_CALL_START,
                                timestamp: Date.now(),
                                data: {
                                    toolName: chunk.toolName,
                                    toolCallId: chunk.toolCallId,
                                    toolArgs: chunk.args as Record<string, unknown>,
                                },
                            }
                            sentToolCallStarts.add(chunk.toolCallId)
                        }
                        toolCalls.push({
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName,
                            args: chunk.args as Record<string, unknown>,
                        })
                        break

                    case 'tool-call-streaming-start':
                        // 流式工具调用开始（部分模型支持）
                        currentToolCall = {
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName,
                            argsText: '',
                        }
                        if (!sentToolCallStarts.has(chunk.toolCallId)) {
                            yield {
                                type: MCPLinkEventType.TOOL_CALL_START,
                                timestamp: Date.now(),
                                data: {
                                    toolName: chunk.toolName,
                                    toolCallId: chunk.toolCallId,
                                },
                            }
                            sentToolCallStarts.add(chunk.toolCallId)
                        }
                        break

                    case 'tool-call-delta':
                        // 流式工具参数
                        if (currentToolCall) {
                            currentToolCall.argsText += chunk.argsTextDelta
                            yield {
                                type: MCPLinkEventType.TOOL_CALL_DELTA,
                                timestamp: Date.now(),
                                data: {
                                    toolCallId: currentToolCall.toolCallId,
                                    argsTextDelta: chunk.argsTextDelta,
                                },
                            }
                        }
                        break

                    case 'finish':
                        // 本轮生成结束
                        // 处理剩余的缓冲内容
                        if (textBuffer) {
                            if (isInsideThinkTag) {
                                // 仍在思考标签内，输出剩余内容作为思考
                                reasoningText += textBuffer
                                yield {
                                    type: MCPLinkEventType.THINKING_DELTA,
                                    timestamp: Date.now(),
                                    data: { content: textBuffer },
                                }
                            } else {
                                // 输出剩余文本
                                if (!hasStartedText) {
                                    hasStartedText = true
                                    yield {
                                        type: MCPLinkEventType.TEXT_START,
                                        timestamp: Date.now(),
                                        data: {},
                                    }
                                }
                                fullText += textBuffer
                                yield {
                                    type: MCPLinkEventType.TEXT_DELTA,
                                    timestamp: Date.now(),
                                    data: { content: textBuffer },
                                }
                            }
                            textBuffer = ''
                        }
                        // 如果有思考过程但还没结束，先结束它
                        if (isInsideThinkTag || (hasStartedReasoning && !hasStartedText)) {
                            yield {
                                type: MCPLinkEventType.THINKING_END,
                                timestamp: Date.now(),
                                data: {},
                            }
                            isInsideThinkTag = false
                        }
                        if (hasStartedText) {
                            yield {
                                type: MCPLinkEventType.TEXT_END,
                                timestamp: Date.now(),
                                data: {},
                            }
                        }
                        break

                    case 'error':
                        yield {
                            type: MCPLinkEventType.ERROR,
                            timestamp: Date.now(),
                            data: { error: chunk.error as Error },
                        }
                        break
                }
            }

            // 检查是否有工具调用
            if (toolCalls.length === 0) {
                // 没有工具调用，结束迭代
                yield {
                    type: MCPLinkEventType.ITERATION_END,
                    timestamp: Date.now(),
                    data: { iteration },
                }
                break
            }

            // 如果有思考文本，标记为思考过程
            if (fullText) {
                yield {
                    type: MCPLinkEventType.THINKING_CONTENT,
                    timestamp: Date.now(),
                    data: { content: fullText },
                }
            }

            // 执行工具调用
            const toolResults: ToolResult[] = []

            for (const toolCall of toolCalls) {
                const toolName = toolCall.toolName
                const toolArgs = toolCall.args
                const toolCallId = toolCall.toolCallId

                // 发送执行中状态
                yield {
                    type: MCPLinkEventType.TOOL_EXECUTING,
                    timestamp: Date.now(),
                    data: { toolName, toolCallId, toolArgs },
                }

                // 执行工具
                const toolStartTime = Date.now()
                let result: unknown
                let isError = false

                try {
                    result = await this.mcpManager.callTool(toolName, toolArgs)
                } catch (error) {
                    result = error instanceof Error ? error.message : String(error)
                    isError = true
                }

                const duration = Date.now() - toolStartTime

                // 发送结果
                yield {
                    type: MCPLinkEventType.TOOL_RESULT,
                    timestamp: Date.now(),
                    data: {
                        toolName,
                        toolResult: result,
                        toolCallId,
                        duration,
                        isError,
                    },
                }

                toolResults.push({
                    toolCallId,
                    toolName,
                    result,
                    isError,
                    duration,
                })

                toolCallRecords.push({
                    name: toolName,
                    arguments: toolArgs,
                    result,
                    duration,
                })
            }

            // 更新消息历史
            messages.push({
                role: 'assistant' as const,
                content: [
                    ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
                    ...toolCalls.map((tc) => ({
                        type: 'tool-call' as const,
                        toolCallId: tc.toolCallId,
                        toolName: tc.toolName,
                        args: tc.args,
                    })),
                ],
            })

            for (const tr of toolResults) {
                messages.push({
                    role: 'tool' as const,
                    content: [
                        {
                            type: 'tool-result' as const,
                            toolCallId: tr.toolCallId,
                            toolName: tr.toolName,
                            result: tr.result,
                        },
                    ],
                })
            }

            yield {
                type: MCPLinkEventType.ITERATION_END,
                timestamp: Date.now(),
                data: { iteration },
            }
        }

        const totalDuration = Date.now() - startTime

        yield {
            type: MCPLinkEventType.COMPLETE,
            timestamp: Date.now(),
            data: {
                totalIterations: iteration,
                totalDuration,
            },
        }
    }
}

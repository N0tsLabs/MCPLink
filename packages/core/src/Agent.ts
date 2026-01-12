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
    type ImmediateResultMatcher,
    type UserMessage,
    type MessageContentPart,
} from './types.js'

/**
 * 默认用户提示词
 * 这只是用户自定义的部分，核心工具调用逻辑已内置到代码中
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业、友好的智能助手。

## 回复要求
- 简洁清晰，重点突出
- 用列表呈现关键信息
- 语气礼貌自然，像专业助手
- 有结论时直接给出，需要补充信息时简单询问`

/**
 * 默认思考阶段提示词
 * 用于引导 AI 进行内部思考（类似 Cursor 的思考风格）
 */
export const DEFAULT_THINKING_PHASE_PROMPT = `
---
这是你的内心独白，用户看不到。

判断当前状态：我拿到了什么？任务完成了吗？还需要查什么？

重要：这里只是思考判断，不要在这里写回复内容（回复是下一步的事）。
---`

/**
 * Agent 引擎
 * 负责执行 AI 对话循环，处理工具调用
 */
export class Agent {
    private model: LanguageModel
    private mcpManager: MCPManager
    private systemPrompt: string
    private maxIterations: number
    private immediateResultMatchers: ImmediateResultMatcher[]
    private parallelToolCalls: boolean
    private enableThinkingPhase: boolean
    private thinkingPhasePrompt: string
    private thinkingMaxTokens?: number

    constructor(
        model: LanguageModel,
        mcpManager: MCPManager,
        options: {
            systemPrompt?: string
            maxIterations?: number
            immediateResultMatchers?: ImmediateResultMatcher[]
            parallelToolCalls?: boolean
            enableThinkingPhase?: boolean
            thinkingPhasePrompt?: string
            thinkingMaxTokens?: number
        } = {}
    ) {
        this.model = model
        this.mcpManager = mcpManager
        this.systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT
        this.maxIterations = options.maxIterations || 10
        this.immediateResultMatchers = options.immediateResultMatchers || []
        this.parallelToolCalls = options.parallelToolCalls ?? true // 默认并行执行
        this.enableThinkingPhase = options.enableThinkingPhase ?? false // 默认关闭，只有模型本身支持 reasoning 才显示思考过程
        this.thinkingPhasePrompt = options.thinkingPhasePrompt || DEFAULT_THINKING_PHASE_PROMPT
        this.thinkingMaxTokens = options.thinkingMaxTokens ?? 1000 // 默认 1000
    }

    /**
     * 生成工具描述文本（用于思考阶段）
     */
    private generateToolsDescription(tools: MCPTool[]): string {
        if (tools.length === 0) {
            return '当前没有可用的工具。'
        }

        let description = ''
        for (const tool of tools) {
            description += `### ${tool.name}\n`
            description += `描述: ${tool.description}\n`
            if (tool.inputSchema.properties) {
                description += `参数:\n`
                for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
                    const propInfo = prop as { type?: string; description?: string }
                    const required = tool.inputSchema.required?.includes(key) ? '必填' : '可选'
                    description += `  - ${key} (${propInfo.type || 'any'}, ${required}): ${propInfo.description || ''}\n`
                }
            }
            description += '\n'
        }
        return description
    }

    /**
     * 摘要化工具返回结果（用于思考阶段，避免 AI 直接格式化输出数据）
     * @param toolName 工具名称
     * @param result 工具返回的结果
     * @returns 摘要字符串
     */
    private summarizeToolResult(toolName: string, result: unknown): string {
        let count = 0
        let resultObj: unknown = result

        // 尝试解析 JSON 字符串
        if (typeof result === 'string') {
            try {
                resultObj = JSON.parse(result)
            } catch {
                // 不是 JSON，返回简单摘要
                return `[工具 ${toolName} 返回了数据]`
            }
        }

        // 统计数据条数
        if (Array.isArray(resultObj)) {
            count = resultObj.length
        } else if (typeof resultObj === 'object' && resultObj !== null) {
            const obj = resultObj as Record<string, unknown>
            // 尝试查找常见的数组字段
            for (const key of ['data', 'list', 'items', 'records', 'results']) {
                if (Array.isArray(obj[key])) {
                    count = (obj[key] as unknown[]).length
                    break
                }
            }
        }

        if (count > 0) {
            return `[工具 ${toolName} 返回了数据，包含 ${count} 条记录]`
        }
        return `[工具 ${toolName} 返回了数据]`
    }

    /**
     * 检查工具返回结果是否匹配即时结果匹配器
     * @param result 工具返回的结果
     * @returns 如果匹配返回 true，否则返回 false
     */
    private matchImmediateResult(result: unknown): boolean {
        const debug = process.env.DEBUG_MCPLINK === 'true'

        if (!this.immediateResultMatchers.length) {
            if (debug) console.log('[MCPLink] ⚠️ 未配置即时结果匹配器')
            return false
        }

        let resultObj: Record<string, unknown> | null = null

        // 如果是字符串，尝试解析为 JSON 对象
        if (typeof result === 'string') {
            try {
                const parsed = JSON.parse(result)
                if (typeof parsed === 'object' && parsed !== null) {
                    resultObj = parsed
                    if (debug) console.log('[MCPLink] 🔍 解析工具结果为对象:', Object.keys(parsed))
                }
            } catch {
                if (debug) console.log('[MCPLink] ⚠️ 工具结果不是有效 JSON')
            }
        } else if (typeof result === 'object' && result !== null) {
            resultObj = result as Record<string, unknown>
            if (debug) console.log('[MCPLink] 🔍 工具结果是对象:', Object.keys(result as object))
        }

        if (!resultObj) {
            if (debug) console.log('[MCPLink] ⚠️ 无法解析工具结果为对象')
            return false
        }

        // 检查是否匹配任意一个匹配器
        for (const matcher of this.immediateResultMatchers) {
            let matched = true
            for (const [key, value] of Object.entries(matcher)) {
                if (resultObj[key] !== value) {
                    matched = false
                    break
                }
            }
            if (matched) {
                if (debug) console.log('[MCPLink] ✅ 即时结果匹配成功:', JSON.stringify(matcher))
                return true
            }
        }

        if (debug) console.log('[MCPLink] ❌ 即时结果未匹配，期望:', JSON.stringify(this.immediateResultMatchers), '实际:', JSON.stringify(resultObj))
        return false
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
     * JSON Schema 到 Zod 的完整递归转换
     * 支持嵌套对象、对象数组、枚举等所有常见类型
     */
    private jsonSchemaToZod(schema: MCPTool['inputSchema']): z.ZodType {
        return this.convertSchemaToZod(schema, schema.required || [])
    }

    /**
     * 递归转换 JSON Schema 节点为 Zod 类型
     */
    private convertSchemaToZod(
        schema: Record<string, unknown>,
        parentRequired: string[] = [],
        key?: string
    ): z.ZodType {
        const type = schema.type as string | undefined
        const description = schema.description as string | undefined
        const enumValues = schema.enum as unknown[] | undefined

        let zodType: z.ZodType

        // 处理枚举类型
        if (enumValues && enumValues.length > 0) {
            if (enumValues.every((v) => typeof v === 'string')) {
                zodType = z.enum(enumValues as [string, ...string[]])
            } else if (enumValues.every((v) => typeof v === 'number')) {
                // 数字枚举：用 union of literals
                const literals = enumValues.map((v) => z.literal(v as number))
                zodType =
                    literals.length === 1
                        ? literals[0]
                        : z.union([literals[0], literals[1], ...literals.slice(2)] as [
                              z.ZodTypeAny,
                              z.ZodTypeAny,
                              ...z.ZodTypeAny[],
                          ])
            } else {
                // 混合枚举或其他类型：降级为 unknown
                zodType = z.unknown()
            }
        } else {
            switch (type) {
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

                case 'null':
                    zodType = z.null()
                    break

                case 'object': {
                    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
                    const required = (schema.required as string[]) || []

                    if (properties) {
                        const shape: Record<string, z.ZodType> = {}
                        for (const [propKey, propSchema] of Object.entries(properties)) {
                            let propZod = this.convertSchemaToZod(propSchema, required, propKey)

                            // 处理 optional
                            if (!required.includes(propKey)) {
                                propZod = propZod.optional()
                            }

                            shape[propKey] = propZod
                        }
                        zodType = z.object(shape)
                    } else {
                        // 没有 properties 定义的对象，允许任意键值
                        zodType = z.record(z.unknown())
                    }
                    break
                }

                case 'array': {
                    const items = schema.items as Record<string, unknown> | undefined
                    if (items) {
                        const itemsRequired = (items.required as string[]) || []
                        zodType = z.array(this.convertSchemaToZod(items, itemsRequired))
                    } else {
                        zodType = z.array(z.unknown())
                    }
                    break
                }

                default:
                    // 未知类型或没有类型定义
                    zodType = z.unknown()
            }
        }

        // 添加描述
        if (description) {
            zodType = zodType.describe(description)
        }

        return zodType
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
     * 将 UserMessage 转换为 Vercel AI SDK 的消息内容格式
     */
    private convertUserMessageToContent(message: UserMessage): string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string | URL; mimeType?: string } | { type: 'file'; data: string | URL; mimeType: string }> {
        if (typeof message === 'string') {
            return message
        }
        // 多模态消息数组
        return message.map((part) => {
            switch (part.type) {
                case 'text':
                    return { type: 'text' as const, text: part.text }
                case 'image':
                    return { type: 'image' as const, image: part.image, mimeType: part.mimeType }
                case 'file':
                    return { type: 'file' as const, data: part.data, mimeType: part.mimeType }
                default:
                    return { type: 'text' as const, text: '' }
            }
        })
    }

    /**
     * 从 UserMessage 提取纯文本内容（用于日志等）
     */
    private extractTextFromMessage(message: UserMessage): string {
        if (typeof message === 'string') {
            return message
        }
        return message
            .filter((part): part is MessageContentPart & { type: 'text' } => part.type === 'text')
            .map((part) => part.text)
            .join('\n')
    }

    /**
     * 流式对话 - 返回事件生成器
     * @param userMessage 用户消息（支持字符串或多模态数组）
     * @param options 可选参数
     * @param options.allowedTools 允许使用的工具名称列表，为空或不传则使用所有工具
     * @param options.history 历史消息列表
     */
    async *chatStream(
        userMessage: UserMessage,
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

        // 添加当前用户消息（支持多模态）
        const userContent = this.convertUserMessageToContent(userMessage)
        messages.push({ role: 'user', content: userContent })

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

            // ============ 思考阶段（如果启用）============
            if (this.enableThinkingPhase && hasTools) {
                yield {
                    type: MCPLinkEventType.THINKING_START,
                    timestamp: Date.now(),
                    data: {},
                }

                // 构建思考阶段的消息（从思考者角度组织）
                const toolsDescription = this.generateToolsDescription(mcpTools)
                const thinkingSystemPrompt = `## 你的角色
你现在是「内部思考者」，这段思考用户看不到。
你的任务是：分析当前状态，判断下一步该做什么。

## 参考信息（可能包含重要配置如认证信息）
${this.systemPrompt}

## 可用工具
${toolsDescription}
${this.thinkingPhasePrompt}`

                // 对消息历史进行处理：摘要化工具返回结果，避免 AI 直接格式化数据
                const summarizedMessages = messages.slice(1).map((msg) => {
                    if (msg.role === 'tool' && Array.isArray(msg.content)) {
                        // 摘要化工具返回结果
                        const summarizedContent = msg.content.map((item) => {
                            if (item.type === 'tool-result') {
                                return {
                                    ...item,
                                    result: this.summarizeToolResult(item.toolName, item.result),
                                }
                            }
                            return item
                        })
                        return { ...msg, content: summarizedContent }
                    }
                    return msg
                })

                const thinkingMessages: CoreMessage[] = [
                    {
                        role: 'system',
                        content: thinkingSystemPrompt,
                    },
                    ...summarizedMessages,
                ]

                // 思考阶段调用（不带工具，强制输出文本，可配置 token 限制）
                const thinkingStream = streamText({
                    model: this.model,
                    messages: thinkingMessages,
                    maxTokens: this.thinkingMaxTokens,
                    // 不传 tools，强制 AI 输出文本思考
                })

                let thinkingContent = ''
                for await (const chunk of thinkingStream.fullStream) {
                    if (chunk.type === 'text-delta') {
                        thinkingContent += chunk.textDelta
                        yield {
                            type: MCPLinkEventType.THINKING_DELTA,
                            timestamp: Date.now(),
                            data: { content: chunk.textDelta },
                        }
                    }
                }

                yield {
                    type: MCPLinkEventType.THINKING_END,
                    timestamp: Date.now(),
                    data: {},
                }

                // 将思考结果添加到消息历史，帮助 AI 更好地执行
                if (thinkingContent) {
                    messages.push({
                        role: 'assistant',
                        content: `[内部决策]\n${thinkingContent}`,
                    })
                }
            }

            // ============ 执行阶段 ============
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
                            // 只在首次收到时添加到工具调用列表，避免重复执行
                            toolCalls.push({
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                args: chunk.args as Record<string, unknown>,
                            })
                        }
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

            // 执行工具调用
            const toolResults: ToolResult[] = []

            // 先发送所有工具的执行中状态
            for (const toolCall of toolCalls) {
                yield {
                    type: MCPLinkEventType.TOOL_EXECUTING,
                    timestamp: Date.now(),
                    data: {
                        toolName: toolCall.toolName,
                        toolCallId: toolCall.toolCallId,
                        toolArgs: toolCall.args,
                    },
                }
            }

            // 是否匹配到即时结果（匹配后直接结束，无需 AI 继续处理）
            let hasImmediateResult = false

            // 根据配置决定是并行还是串行执行
            if (this.parallelToolCalls && toolCalls.length > 1) {
                // 并行执行所有工具
                const executePromises = toolCalls.map(async (toolCall) => {
                    const toolStartTime = Date.now()
                    let result: unknown
                    let isError = false

                    try {
                        result = await this.mcpManager.callTool(toolCall.toolName, toolCall.args)
                    } catch (error) {
                        result = error instanceof Error ? error.message : String(error)
                        isError = true
                    }

                    const duration = Date.now() - toolStartTime
                    return {
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        args: toolCall.args,
                        result,
                        isError,
                        duration,
                    }
                })

                const results = await Promise.all(executePromises)

                // 按顺序发送结果事件
                for (const r of results) {
                    yield {
                        type: MCPLinkEventType.TOOL_RESULT,
                        timestamp: Date.now(),
                        data: {
                            toolName: r.toolName,
                            toolResult: r.result,
                            toolCallId: r.toolCallId,
                            duration: r.duration,
                            isError: r.isError,
                        },
                    }

                    // 检查是否匹配即时结果
                    if (!r.isError && this.matchImmediateResult(r.result)) {
                        hasImmediateResult = true
                        yield {
                            type: MCPLinkEventType.IMMEDIATE_RESULT,
                            timestamp: Date.now(),
                            data: {
                                toolName: r.toolName,
                                toolCallId: r.toolCallId,
                                immediateResult: r.result,
                            },
                        }
                    }

                    toolResults.push({
                        toolCallId: r.toolCallId,
                        toolName: r.toolName,
                        result: r.result,
                        isError: r.isError,
                        duration: r.duration,
                    })

                    toolCallRecords.push({
                        name: r.toolName,
                        arguments: r.args,
                        result: r.result,
                        duration: r.duration,
                    })
                }
            } else {
                // 串行执行工具
                for (const toolCall of toolCalls) {
                    const toolName = toolCall.toolName
                    const toolArgs = toolCall.args
                    const toolCallId = toolCall.toolCallId

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

                    // 检查是否匹配即时结果
                    if (!isError && this.matchImmediateResult(result)) {
                        hasImmediateResult = true
                        yield {
                            type: MCPLinkEventType.IMMEDIATE_RESULT,
                            timestamp: Date.now(),
                            data: {
                                toolName,
                                toolCallId,
                                immediateResult: result,
                            },
                        }
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
            }

            // 如果匹配到即时结果，直接结束迭代（无需 AI 继续思考处理）
            if (hasImmediateResult) {
                yield {
                    type: MCPLinkEventType.ITERATION_END,
                    timestamp: Date.now(),
                    data: { iteration },
                }
                break
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

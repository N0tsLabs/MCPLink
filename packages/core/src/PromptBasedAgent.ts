import { streamText, type LanguageModel, type CoreMessage } from 'ai'
import type { MCPManager } from './MCPManager.js'
import { MCPLinkEventType, type MCPTool, type MCPLinkEvent, type ImmediateResultMatcher, type UserMessage, type MessageContentPart } from './types.js'

/**
 * 基于 Prompt 的 Agent
 * 通过 prompt 工程让任意模型支持工具调用和思考过程
 * 
 * 设计原则：
 * 1. 简洁 - 不做过多干预，让 AI 自己思考和决策
 * 2. 通用 - 支持任何模型，不依赖特定 API
 * 3. 可靠 - 稳定的状态机解析
 */
export class PromptBasedAgent {
    private model: LanguageModel
    private mcpManager: MCPManager
    private systemPrompt: string
    private maxIterations: number
    private immediateResultMatchers: ImmediateResultMatcher[]
    private parallelToolCalls: boolean
    // PromptBasedAgent 本身通过 prompt 实现思考，此配置保留以保持接口一致
    private enableThinkingPhase: boolean

    constructor(
        model: LanguageModel,
        mcpManager: MCPManager,
        options: {
            systemPrompt?: string
            maxIterations?: number
            immediateResultMatchers?: ImmediateResultMatcher[]
            parallelToolCalls?: boolean
            enableThinkingPhase?: boolean
            thinkingPhasePrompt?: string  // 保留以保持接口一致，PromptBasedAgent 通过内置 prompt 实现思考
            thinkingMaxTokens?: number    // 保留以保持接口一致
        } = {}
    ) {
        this.model = model
        this.mcpManager = mcpManager
        this.systemPrompt = options.systemPrompt || ''
        this.maxIterations = options.maxIterations || 10
        this.immediateResultMatchers = options.immediateResultMatchers || []
        // PromptBasedAgent 每次只解析一个工具调用，此配置保留以保持接口一致
        this.parallelToolCalls = options.parallelToolCalls ?? true
        // PromptBasedAgent 本身就通过 prompt 实现思考，无需额外阶段
        this.enableThinkingPhase = options.enableThinkingPhase ?? false
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
     * 生成工具列表描述
     */
    private generateToolsDescription(tools: MCPTool[]): string {
        if (tools.length === 0) {
            return '当前没有可用的工具。'
        }

        let description = ''
        for (const tool of tools) {
            description += `### ${tool.name}\n`
            description += `描述: ${tool.description}\n`
            description += `参数: ${JSON.stringify(tool.inputSchema, null, 2)}\n\n`
        }
        return description
    }

    /**
     * 内置系统提示词 - 强调格式约束
     */
    private readonly BUILT_IN_PROMPT = `
## 工具调用格式（必须严格遵守）

当你需要获取数据或执行操作时，**只能**使用以下格式：

<tool_call>
{"name": "工具名称", "arguments": {"参数名": "值"}}
</tool_call>

### 工作流程
1. 分析用户需求
2. 如需数据，输出 <tool_call>...</tool_call> 后**立即停止**
3. 系统会执行工具并返回真实结果
4. 收到结果后，用中文整理回复用户

### 严格禁止
- ❌ 自己编写工具返回结果（如 \`结果:{...}\` 或 \`{"code":200...}\`）
- ❌ 模拟工具调用（如 \`RPCCall:\`、\`FunctionCall:\`）
- ❌ 在没有真实工具结果的情况下编造数据
- ❌ 一次输出中同时包含工具调用和最终回复

### 正确示例
用户: "查询我的订单"
你的输出:
<tool_call>
{"name": "get_orders", "arguments": {"token": "xxx"}}
</tool_call>

（然后停止，等待系统返回真实结果）

### 回复格式
- 使用中文
- 使用 Markdown 格式美化输出
- 列表数据每项独占一行
`

    /**
     * 构建完整的系统提示词
     */
    private buildSystemPrompt(tools: MCPTool[]): string {
        const toolsDescription = this.generateToolsDescription(tools)
        const userPrompt = this.systemPrompt || '你是一个智能助手。'

        return `${userPrompt}

## 可用工具
${toolsDescription}
${this.BUILT_IN_PROMPT}`
    }

    /**
     * 解析工具调用
     */
    private parseToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
        // 方式1: <tool_call> 标签
        const tagMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i)
        if (tagMatch) {
            try {
                const json = JSON.parse(tagMatch[1].trim())
                if (json.name) return { name: json.name, arguments: json.arguments || {} }
            } catch { /* ignore */ }
        }

        // 方式2: ```json 代码块
        const codeMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*\n?\s*```/i)
        if (codeMatch) {
            try {
                const json = JSON.parse(codeMatch[1].trim())
                if (json.name) return { name: json.name, arguments: json.arguments || {} }
            } catch { /* ignore */ }
        }

        // 方式3: 裸 JSON
        const jsonMatch = text.match(/\{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/i)
        if (jsonMatch) {
            try {
                const fullMatch = jsonMatch[0]
                const json = JSON.parse(fullMatch)
                if (json.name) return { name: json.name, arguments: json.arguments || {} }
            } catch { /* ignore */ }
        }

        return null
    }

    /**
     * 智能压缩历史消息
     * - 用户消息完整保留
     * - AI 回复保留关键信息（ID、名称、数量、价格等）
     * - 去除冗长的 JSON 原始数据
     */
    private compressHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): Array<{ role: 'user' | 'assistant'; content: string }> {
        const MAX_HISTORY_LENGTH = 20 // 最多保留 20 条历史消息
        const MAX_USER_MESSAGE_LENGTH = 500 // 用户消息最大长度
        const MAX_ASSISTANT_MESSAGE_LENGTH = 1500 // AI 回复最大长度

        // 只保留最近的消息
        const recentHistory = history.slice(-MAX_HISTORY_LENGTH)

        return recentHistory.map((msg) => {
            if (msg.role === 'user') {
                // 用户消息：保持完整（通常较短）
                if (msg.content.length <= MAX_USER_MESSAGE_LENGTH) {
                    return msg
                }
                return {
                    role: msg.role,
                    content: msg.content.slice(0, MAX_USER_MESSAGE_LENGTH) + '...'
                }
            }

            // AI 回复：智能压缩
            let content = msg.content

            // 1. 移除大段的 JSON 代码块，但保留摘要
            content = content.replace(/```json\n[\s\S]*?\n```/g, '[工具返回数据]')
            
            // 2. 移除工具返回的原始数据标记
            content = content.replace(/## .*?\(原始JSON\)[\s\S]*?(?=##|$)/g, '')
            
            // 3. 保留表格（通常是整理后的关键信息）
            // 表格不压缩

            // 4. 如果仍然过长，截断
            if (content.length > MAX_ASSISTANT_MESSAGE_LENGTH) {
                // 尝试保留表格部分
                const tableMatch = content.match(/\|[\s\S]*?\|/g)
                if (tableMatch) {
                    const tables = tableMatch.join('\n')
                    if (tables.length < MAX_ASSISTANT_MESSAGE_LENGTH) {
                        content = content.slice(0, MAX_ASSISTANT_MESSAGE_LENGTH - tables.length) + '\n' + tables
                    }
                }
                content = content.slice(0, MAX_ASSISTANT_MESSAGE_LENGTH) + '...'
            }

            return { role: msg.role, content: content.trim() || msg.content.slice(0, 500) }
        })
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
     * 流式对话（支持多模态消息）
     */
    async *chatStream(
        userMessage: UserMessage,
        options?: {
            allowedTools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
    ): AsyncGenerator<MCPLinkEvent> {
        const startTime = Date.now()

        // 获取工具
        let mcpTools = this.mcpManager.getAllTools()
        if (options?.allowedTools?.length) {
            mcpTools = mcpTools.filter((t) => options.allowedTools!.includes(t.name))
        }

        // 构建消息
        const messages: CoreMessage[] = [
            { role: 'system', content: this.buildSystemPrompt(mcpTools) }
        ]

        // 添加历史（压缩后）
        if (options?.history?.length) {
            const compressedHistory = this.compressHistory(options.history)
            console.log(`[PromptBasedAgent] 📚 历史消息: ${options.history.length} 条 -> 压缩后: ${compressedHistory.length} 条`)
            for (const msg of compressedHistory) {
                messages.push({ role: msg.role, content: msg.content })
            }
        }

        // 添加当前消息（支持多模态）
        const userContent = this.convertUserMessageToContent(userMessage)
        messages.push({ role: 'user', content: userContent })
        const textPreview = this.extractTextFromMessage(userMessage)
        console.log(`[PromptBasedAgent] 📝 用户消息: "${textPreview.slice(0, 50)}${textPreview.length > 50 ? '...' : ''}"`)
        console.log(`[PromptBasedAgent] 📊 总消息数: ${messages.length}`)

        let iteration = 0

        while (iteration < this.maxIterations) {
            iteration++

            yield {
                type: MCPLinkEventType.ITERATION_START,
                timestamp: Date.now(),
                data: { iteration, maxIterations: this.maxIterations },
            }

            // 调用模型（带超时控制）
            console.log(`[PromptBasedAgent] 🤖 调用模型，迭代 ${iteration}/${this.maxIterations}...`)
            const modelStartTime = Date.now()

            const stream = streamText({
                model: this.model,
                messages,
                // 设置请求超时
                experimental_telemetry: {
                    isEnabled: false, // 禁用遥测以减少开销
                },
                // 禁用 Qwen 思考模式 - 使用 openai 命名空间因为这是通过 OpenAI 兼容接口调用
                providerOptions: {
                    openai: {
                        enable_thinking: false
                    }
                }
            })

            // 状态
            let fullResponse = ''
            let buffer = ''
            let inThinking = false
            let inToolCall = false
            let thinkingStarted = false
            let thinkingEnded = false
            let textStarted = false

            // 流式处理（带超时保护）
            let firstChunkReceived = false
            const FIRST_CHUNK_TIMEOUT = 120000 // 2分钟等待首个响应
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            
            // 设置超时
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`模型响应超时 (${FIRST_CHUNK_TIMEOUT / 1000}秒无响应)`))
                }, FIRST_CHUNK_TIMEOUT)
            })

            try {
                for await (const chunk of stream.fullStream) {
                    // 收到第一个 chunk 后取消超时
                    if (!firstChunkReceived) {
                        firstChunkReceived = true
                        if (timeoutId) {
                            clearTimeout(timeoutId)
                            timeoutId = null
                        }
                        console.log(`[PromptBasedAgent] ⚡ 首个 chunk 到达，耗时: ${Date.now() - modelStartTime}ms`)
                    }
                // 原生 reasoning 支持
                if (chunk.type === 'reasoning') {
                    if (!thinkingStarted) {
                        thinkingStarted = true
                        yield { type: MCPLinkEventType.THINKING_START, timestamp: Date.now(), data: {} }
                    }
                    if (chunk.textDelta) {
                        yield { type: MCPLinkEventType.THINKING_DELTA, timestamp: Date.now(), data: { content: chunk.textDelta } }
                    }
                    continue
                }

                if (chunk.type === 'text-delta') {
                    const delta = chunk.textDelta
                    buffer += delta
                    fullResponse += delta

                    // 简单状态机解析
                    while (buffer.length > 0) {
                        if (!inThinking && !inToolCall) {
                            // 检查 <think> 开始
                            const thinkStart = buffer.indexOf('<think>')
                            if (thinkStart !== -1) {
                                // 输出 <think> 之前的文本
                                if (thinkStart > 0) {
                                    const before = buffer.substring(0, thinkStart)
                                    if (before.trim() && thinkingEnded) {
                                        if (!textStarted) {
                                            textStarted = true
                                            yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                                        }
                                        yield { type: MCPLinkEventType.TEXT_DELTA, timestamp: Date.now(), data: { content: before } }
                                    }
                                }
                                inThinking = true
                                if (!thinkingStarted) {
                                    thinkingStarted = true
                                    yield { type: MCPLinkEventType.THINKING_START, timestamp: Date.now(), data: {} }
                                }
                                buffer = buffer.substring(thinkStart + 7)
                                continue
                            }

                            // 检查 <tool_call> 开始
                            const toolStart = buffer.indexOf('<tool_call>')
                            if (toolStart !== -1) {
                                if (toolStart > 0) {
                                    const before = buffer.substring(0, toolStart)
                                    if (before.trim() && thinkingEnded) {
                                        if (!textStarted) {
                                            textStarted = true
                                            yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                                        }
                                        yield { type: MCPLinkEventType.TEXT_DELTA, timestamp: Date.now(), data: { content: before } }
                                    }
                                }
                                inToolCall = true
                                buffer = buffer.substring(toolStart + 11)
                                continue
                            }

                            // 没有特殊标签，检查是否可以安全输出
                            if (!buffer.includes('<')) {
                                if (buffer.trim() && (thinkingEnded || !thinkingStarted)) {
                                    // 不再自动生成伪造的思考过程，只有模型本身输出 <think> 标签时才显示思考
                                    if (!textStarted) {
                                        textStarted = true
                                        yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                                    }
                                    yield { type: MCPLinkEventType.TEXT_DELTA, timestamp: Date.now(), data: { content: buffer } }
                                }
                                buffer = ''
                            }
                            break
                        }

                        if (inThinking) {
                            const thinkEnd = buffer.indexOf('</think>')
                            if (thinkEnd !== -1) {
                                const content = buffer.substring(0, thinkEnd)
                                if (content) {
                                    yield { type: MCPLinkEventType.THINKING_DELTA, timestamp: Date.now(), data: { content } }
                                }
                                yield { type: MCPLinkEventType.THINKING_END, timestamp: Date.now(), data: {} }
                                thinkingEnded = true
                                inThinking = false
                                buffer = buffer.substring(thinkEnd + 8)
                                continue
                            }
                            // 流式输出思考内容
                            if (buffer.length > 10 && !buffer.includes('<')) {
                                const safe = buffer.substring(0, buffer.length - 10)
                                yield { type: MCPLinkEventType.THINKING_DELTA, timestamp: Date.now(), data: { content: safe } }
                                buffer = buffer.substring(safe.length)
                            }
                            break
                        }

                        if (inToolCall) {
                            const toolEnd = buffer.indexOf('</tool_call>')
                            if (toolEnd !== -1) {
                                inToolCall = false
                                buffer = buffer.substring(toolEnd + 12)
                                continue
                            }
                            break
                        }

                        break
                    }
                }

                if (chunk.type === 'finish') {
                    // 处理剩余内容
                    if (buffer.trim()) {
                        if (inThinking) {
                            yield { type: MCPLinkEventType.THINKING_DELTA, timestamp: Date.now(), data: { content: buffer } }
                            yield { type: MCPLinkEventType.THINKING_END, timestamp: Date.now(), data: {} }
                            thinkingEnded = true
                        } else if (!inToolCall) {
                            if (!textStarted) {
                                textStarted = true
                                yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                            }
                            yield { type: MCPLinkEventType.TEXT_DELTA, timestamp: Date.now(), data: { content: buffer } }
                        }
                    }
                    if (textStarted) {
                        yield { type: MCPLinkEventType.TEXT_END, timestamp: Date.now(), data: {} }
                    }
                }
            }
            } finally {
                // 清理超时计时器
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }

            // 检查工具调用
            const toolCall = this.parseToolCall(fullResponse)

            if (toolCall) {
                const toolCallId = `tool-${Date.now()}`

                // 发送工具调用事件
                yield {
                    type: MCPLinkEventType.TOOL_CALL_START,
                    timestamp: Date.now(),
                    data: { toolName: toolCall.name, toolCallId, toolArgs: toolCall.arguments },
                }

                yield {
                    type: MCPLinkEventType.TOOL_EXECUTING,
                    timestamp: Date.now(),
                    data: { toolName: toolCall.name, toolCallId, toolArgs: toolCall.arguments },
                }

                // 执行工具
                const toolStartTime = Date.now()
                let result: unknown
                let isError = false

                try {
                    result = await this.mcpManager.callTool(toolCall.name, toolCall.arguments)
                } catch (error) {
                    result = error instanceof Error ? error.message : String(error)
                    isError = true
                }

                const duration = Date.now() - toolStartTime

                yield {
                    type: MCPLinkEventType.TOOL_RESULT,
                    timestamp: Date.now(),
                    data: { toolName: toolCall.name, toolResult: result, toolCallId, duration, isError },
                }

                // 检查是否匹配即时结果，如果匹配则直接结束（无需 AI 继续思考处理）
                if (!isError && this.matchImmediateResult(result)) {
                    yield {
                        type: MCPLinkEventType.IMMEDIATE_RESULT,
                        timestamp: Date.now(),
                        data: {
                            toolName: toolCall.name,
                            toolCallId,
                            immediateResult: result,
                        },
                    }
                    // 直接结束迭代
                    yield { type: MCPLinkEventType.ITERATION_END, timestamp: Date.now(), data: { iteration } }
                    yield {
                        type: MCPLinkEventType.COMPLETE,
                        timestamp: Date.now(),
                        data: { totalDuration: Date.now() - startTime, totalIterations: iteration },
                    }
                    return
                }

                // 更新消息历史
                messages.push({ role: 'assistant', content: fullResponse })

                const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                messages.push({
                    role: 'user',
                    content: `工具 ${toolCall.name} 返回结果：\n${resultStr}\n\n请根据结果用中文回复用户。`,
                })

                yield { type: MCPLinkEventType.ITERATION_END, timestamp: Date.now(), data: { iteration } }
                continue
            }

            console.log(`[PromptBasedAgent] ✅ 模型响应完成，耗时: ${Date.now() - modelStartTime}ms，响应长度: ${fullResponse.length}`)

            // 没有工具调用
            // 如果没有任何输出，尝试直接输出响应
            if (!textStarted && fullResponse.trim()) {
                // 清理标签后输出
                let cleanText = fullResponse
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
                    .trim()

                if (cleanText) {
                    yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                    yield { type: MCPLinkEventType.TEXT_DELTA, timestamp: Date.now(), data: { content: cleanText } }
                    yield { type: MCPLinkEventType.TEXT_END, timestamp: Date.now(), data: {} }
                }
            }

            yield { type: MCPLinkEventType.ITERATION_END, timestamp: Date.now(), data: { iteration } }
            break
        }

        yield {
            type: MCPLinkEventType.COMPLETE,
            timestamp: Date.now(),
            data: { totalDuration: Date.now() - startTime, totalIterations: iteration },
        }
    }
}

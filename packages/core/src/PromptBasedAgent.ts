import { streamText, type LanguageModel, type CoreMessage } from 'ai'
import type { MCPManager } from './MCPManager.js'
import { MCPLinkEventType, type MCPTool, type MCPLinkEvent } from './types.js'

/**
 * 基于 Prompt 的 Agent
 * 通过 prompt 工程让任意模型支持工具调用和思考过程
 */
export class PromptBasedAgent {
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
        this.systemPrompt = options.systemPrompt || ''
        this.maxIterations = options.maxIterations || 10
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
            description += `${tool.description}\n`

            if (tool.inputSchema.properties) {
                description += '参数:\n'
                const required = tool.inputSchema.required || []
                for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
                    const propSchema = prop as { type?: string; description?: string }
                    const isRequired = required.includes(key)
                    description += `- ${key} (${propSchema.type || 'any'}${isRequired ? ', 必填' : ''}): ${propSchema.description || '无描述'}\n`
                }
            }
            description += '\n'
        }
        return description
    }

    /**
     * 构建完整的系统提示词
     */
    private buildSystemPrompt(tools: MCPTool[]): string {
        const toolsDescription = this.generateToolsDescription(tools)
        const basePrompt = this.systemPrompt || '你是一个智能助手。'

        return `${basePrompt}

## ⚠️ 最重要的规则 - 必须严格遵守

### 第一步：思考（必须）
在任何回复之前，你必须首先用 <think> 标签思考：
<think>
1. 用户要什么？
2. 需要使用什么工具？
3. 如何完成任务？
</think>

### 第二步：行动（必须）
思考完成后，你必须立即采取行动：
- 如果需要使用工具 → 立即输出 <tool_call>
- 如果不需要工具 → 直接回复用户

**⚠️ 禁止只思考不行动！** 每次思考后必须有后续输出。

### 工具调用格式
<tool_call>
{"name": "工具名称", "arguments": {"参数名": "参数值"}}
</tool_call>

示例（总结网站内容）：
<think>
用户要总结 wkea.cn，我需要先获取网站内容，使用 fetch 工具。
</think>
<tool_call>
{"name": "fetch", "arguments": {"url": "http://wkea.cn"}}
</tool_call>

**重要规则：**
1. 每次只调用一个工具
2. 调用工具后停止输出，等待结果
3. 收到 <tool_result> 后继续处理

### 可用工具
${toolsDescription}

### 工具结果处理
收到工具结果后：
<tool_result name="工具名称" success="true/false">
{结果内容}
</tool_result>

你可以：
1. 根据结果直接回复用户
2. 继续调用其他工具

### 最终回复
工具调用完成后，用中文总结并回复用户，不要使用任何标签。

### 重要提醒
- 所有回复使用中文
- 思考后必须行动（调用工具或回复）
- JSON 格式必须正确有效
- 网站查询类问题必须使用 fetch 工具`
    }

    /**
     * 解析 TODO 列表
     * 格式: <todo title="标题">
     * - 步骤1
     * - 步骤2
     * </todo>
     */
    private parseTodoList(text: string): { title: string; items: string[] } | null {
        const match = text.match(/<todo\s+title=["']([^"']+)["']>([\s\S]*?)<\/todo>/i)
        if (!match) return null

        const title = match[1]
        const content = match[2]
        const items: string[] = []

        // 解析每一行的步骤
        const lines = content.split('\n')
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
                const item = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim()
                if (item) {
                    items.push(item)
                }
            }
        }

        return items.length > 0 ? { title, items } : null
    }

    /**
     * 解析 TODO 更新
     * 格式: <todo_update id="1" status="completed" result="结果"/>
     */
    private parseTodoUpdate(text: string): { id: string; status: string; result?: string } | null {
        const match = text.match(/<todo_update\s+id=["']([^"']+)["']\s+status=["']([^"']+)["'](?:\s+result=["']([^"']*)["'])?\s*\/?>/i)
        if (!match) return null

        return {
            id: match[1],
            status: match[2],
            result: match[3],
        }
    }

    /**
     * 尝试从 JSON 字符串解析工具调用
     */
    private tryParseToolCallJson(jsonStr: string): { name: string; arguments: Record<string, unknown> } | null {
        try {
            const json = JSON.parse(jsonStr.trim())
            if (json.name && typeof json.name === 'string') {
                return {
                    name: json.name,
                    arguments: json.arguments || {},
                }
            }
        } catch {
            // 尝试修复常见问题
            try {
                const fixed = jsonStr.replace(/'/g, '"')
                const json = JSON.parse(fixed)
                if (json.name && typeof json.name === 'string') {
                    return {
                        name: json.name,
                        arguments: json.arguments || {},
                    }
                }
            } catch {
                // 解析失败
            }
        }
        return null
    }

    /**
     * 解析文本中的工具调用
     * 支持多种格式:
     * 1. <tool_call>{"name": "...", "arguments": {...}}</tool_call>
     * 2. ```json\n{"name": "...", "arguments": {...}}\n```
     * 3. 裸 JSON: {"name": "...", "arguments": {...}}
     */
    private parseToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
        // 1. 尝试 <tool_call> 标签格式
        const toolCallMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i)
        if (toolCallMatch) {
            const result = this.tryParseToolCallJson(toolCallMatch[1])
            if (result) return result
        }

        // 2. 尝试 ```json 代码块格式
        const codeBlockMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/i)
        if (codeBlockMatch) {
            const result = this.tryParseToolCallJson(codeBlockMatch[1])
            if (result) return result
        }

        // 3. 尝试裸 JSON 格式（寻找包含 "name" 和 "arguments" 的 JSON 对象）
        const jsonMatch = text.match(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/i)
        if (jsonMatch) {
            const result = this.tryParseToolCallJson(jsonMatch[0])
            if (result) return result
        }

        return null
    }

    /**
     * 流式对话 - 返回事件生成器
     */
    async *chatStream(
        userMessage: string,
        options?: {
            allowedTools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
    ): AsyncGenerator<MCPLinkEvent> {
        const startTime = Date.now()

        // 获取所有可用工具
        let mcpTools = this.mcpManager.getAllTools()
        if (options?.allowedTools && options.allowedTools.length > 0) {
            mcpTools = mcpTools.filter((tool) => options.allowedTools!.includes(tool.name))
        }

        // 构建消息历史
        const messages: CoreMessage[] = [{ role: 'system', content: this.buildSystemPrompt(mcpTools) }]

        // 添加历史消息
        if (options?.history && options.history.length > 0) {
            for (const msg of options.history) {
                messages.push({ role: msg.role, content: msg.content })
            }
        }

        // 添加当前用户消息
        messages.push({ role: 'user', content: userMessage })

        let iteration = 0

        while (iteration < this.maxIterations) {
            iteration++

            yield {
                type: MCPLinkEventType.ITERATION_START,
                timestamp: Date.now(),
                data: { iteration, maxIterations: this.maxIterations },
            }

            // 流式调用模型
            const stream = streamText({
                model: this.model,
                messages,
            })

            // 状态变量
            let fullResponse = ''
            let hasStartedThinking = false
            let hasEndedThinking = false
            let hasStartedText = false
            let hasNativeReasoning = false // 是否有原生 reasoning 事件
            let isFirstTextChunk = true // 用于检测是否需要跳过思考

            // 缓冲区用于标签检测
            let buffer = ''

            // 当前解析状态
            let parseState: 'normal' | 'think' | 'tool_call' | 'todo' = 'normal'

            // TODO 相关状态
            let currentTodoId: string | null = null
            let todoItemCounter = 0
            let hasTodoCreated = false // 防止重复创建 TODO

            // 流式处理
            for await (const chunk of stream.fullStream) {
                // 处理原生 reasoning 事件（deepseek-reasoner 等模型）
                if (chunk.type === 'reasoning') {
                    hasNativeReasoning = true
                    if (!hasStartedThinking) {
                        hasStartedThinking = true
                        yield { type: MCPLinkEventType.THINKING_START, timestamp: Date.now(), data: {} }
                    }
                    if (chunk.textDelta) {
                        yield {
                            type: MCPLinkEventType.THINKING_DELTA,
                            timestamp: Date.now(),
                            data: { content: chunk.textDelta },
                        }
                    }
                    continue
                }

                if (chunk.type === 'text-delta') {
                    // 如果有原生 reasoning，在第一个 text-delta 时结束思考
                    if (hasNativeReasoning && !hasEndedThinking) {
                        hasEndedThinking = true
                        yield { type: MCPLinkEventType.THINKING_END, timestamp: Date.now(), data: {} }
                    }

                    buffer += chunk.textDelta
                    fullResponse += chunk.textDelta

                    // 检测文本开头 - 如果累积了足够的文本且不以 <think> 开头，则跳过思考阶段
                    // 这确保在第二次迭代时，如果 AI 直接回复而不思考，文本能正常输出
                    if (isFirstTextChunk && !hasStartedThinking && !hasEndedThinking) {
                        const trimmedBuffer = buffer.trimStart()
                        if (trimmedBuffer.length >= 7) {
                            isFirstTextChunk = false
                            if (!trimmedBuffer.startsWith('<think>') && !trimmedBuffer.startsWith('<think ')) {
                                // AI 直接回复，没有思考，跳过思考阶段
                                hasEndedThinking = true
                            }
                        }
                    }

                    // 持续处理 buffer 直到无法继续
                    let processed = true
                    while (processed && buffer.length > 0) {
                        processed = false

                        if (parseState === 'normal') {
                            // 首先过滤掉 AI 自己生成的 <tool_result> 标签（这是假的工具结果）
                            const fakeToolResultMatch = buffer.match(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/i)
                            if (fakeToolResultMatch) {
                                // 移除假的 tool_result 标签及其内容
                                buffer = buffer.replace(fakeToolResultMatch[0], '')
                                processed = true
                                continue
                            }

                            // 检查各种标签/格式的起始位置
                            const thinkStart = buffer.indexOf('<think>')
                            const toolStart = buffer.indexOf('<tool_call>')
                            const codeBlockStart = buffer.indexOf('```')
                            const todoStart = buffer.indexOf('<todo ')
                            const todoUpdateStart = buffer.indexOf('<todo_update ')
                            // 检查裸 JSON 格式 (以换行+{ 或行首{ 开始，包含 "name")
                            const jsonMatch = buffer.match(/(?:^|\n)\s*\{\s*\n?\s*"name"/)
                            const jsonStart = jsonMatch ? buffer.indexOf(jsonMatch[0]) : -1

                            // 找出最早出现的标记
                            const markers = [
                                { type: 'think', pos: thinkStart },
                                { type: 'tool_call', pos: toolStart },
                                { type: 'code_block', pos: codeBlockStart },
                                { type: 'json', pos: jsonStart },
                                { type: 'todo', pos: todoStart },
                                { type: 'todo_update', pos: todoUpdateStart },
                            ].filter((m) => m.pos !== -1)

                            if (markers.length > 0) {
                                markers.sort((a, b) => a.pos - b.pos)
                                const first = markers[0]

                                // 输出标记之前的文本
                                if (first.pos > 0) {
                                    const before = buffer.substring(0, first.pos)
                                    if (before.trim() && hasEndedThinking) {
                                        if (!hasStartedText) {
                                            hasStartedText = true
                                            yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                                        }
                                        yield {
                                            type: MCPLinkEventType.TEXT_DELTA,
                                            timestamp: Date.now(),
                                            data: { content: before },
                                        }
                                    }
                                }

                                if (first.type === 'think') {
                                    parseState = 'think'
                                    if (!hasStartedThinking) {
                                        hasStartedThinking = true
                                        yield { type: MCPLinkEventType.THINKING_START, timestamp: Date.now(), data: {} }
                                    }
                                    buffer = buffer.substring(first.pos + 7)
                                    processed = true
                                } else if (first.type === 'tool_call') {
                                    parseState = 'tool_call'
                                    buffer = buffer.substring(first.pos + 11)
                                    processed = true
                                } else if (first.type === 'code_block') {
                                    // 检查是否是 json 代码块（可能是工具调用）
                                    const afterBlock = buffer.substring(first.pos + 3)
                                    if (afterBlock.match(/^json\s*\n/) || afterBlock.match(/^\s*\n?\s*\{/)) {
                                        parseState = 'tool_call'
                                        buffer = buffer.substring(first.pos)
                                        processed = true
                                    } else {
                                        // 普通代码块，继续输出
                                        buffer = buffer.substring(first.pos)
                                    }
                                } else if (first.type === 'json') {
                                    // 裸 JSON 格式的工具调用
                                    parseState = 'tool_call'
                                    // 保留完整的 JSON 开始
                                    const actualStart = buffer.indexOf('{', first.pos)
                                    buffer = buffer.substring(actualStart)
                                    processed = true
                                } else if (first.type === 'todo') {
                                    // TODO 列表开始
                                    parseState = 'todo'
                                    buffer = buffer.substring(first.pos)
                                    processed = true
                                } else if (first.type === 'todo_update') {
                                    // TODO 更新 - 单行标签，直接解析
                                    const updateEnd = buffer.indexOf('/>', first.pos)
                                    const updateEnd2 = buffer.indexOf('>', first.pos)
                                    const endPos = updateEnd !== -1 ? updateEnd + 2 : (updateEnd2 !== -1 ? updateEnd2 + 1 : -1)
                                    
                                    if (endPos !== -1) {
                                        const updateTag = buffer.substring(first.pos, endPos)
                                        const update = this.parseTodoUpdate(updateTag)
                                        
                                        if (update && currentTodoId) {
                                            yield {
                                                type: MCPLinkEventType.TODO_ITEM_UPDATE,
                                                timestamp: Date.now(),
                                                data: {
                                                    todoId: currentTodoId,
                                                    todoItemId: update.id,
                                                    todoItemStatus: update.status as any,
                                                    todoItemResult: update.result,
                                                },
                                            }
                                        }
                                        
                                        buffer = buffer.substring(endPos)
                                        processed = true
                                    }
                                }
                            } else if (!buffer.includes('<') && !buffer.includes('`') && !buffer.includes('{')) {
                                // 没有潜在标签，可以安全输出
                                if (buffer.trim() && hasEndedThinking) {
                                    if (!hasStartedText) {
                                        hasStartedText = true
                                        yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                                    }
                                    yield {
                                        type: MCPLinkEventType.TEXT_DELTA,
                                        timestamp: Date.now(),
                                        data: { content: buffer },
                                    }
                                    buffer = ''
                                    processed = true
                                } else if (!hasEndedThinking && !hasStartedThinking && isFirstTextChunk) {
                                    // 还在检测是否是直接回复，保留 buffer 继续累积
                                    // 不清空 buffer，等待更多内容
                                } else {
                                    // 其他情况，清空 buffer
                                    buffer = ''
                                    processed = true
                                }
                            }
                            // 如果有潜在标记但不完整，继续等待
                        } else if (parseState === 'think') {
                            // 在 <think> 内，寻找 </think>
                            const thinkEnd = buffer.indexOf('</think>')
                            if (thinkEnd !== -1) {
                                // 输出思考内容（在结束标签之前的部分）
                                const content = buffer.substring(0, thinkEnd)
                                if (content) {
                                    yield {
                                        type: MCPLinkEventType.THINKING_DELTA,
                                        timestamp: Date.now(),
                                        data: { content },
                                    }
                                }
                                // 结束思考
                                yield { type: MCPLinkEventType.THINKING_END, timestamp: Date.now(), data: {} }
                                hasEndedThinking = true
                                parseState = 'normal'
                                buffer = buffer.substring(thinkEnd + 8)
                                processed = true
                            } else {
                                // 流式输出思考内容 - 保留最后 10 个字符以检测 </think>
                                const safeLength = Math.max(0, buffer.length - 10)
                                if (safeLength > 0) {
                                    const safeContent = buffer.substring(0, safeLength)
                                    yield {
                                        type: MCPLinkEventType.THINKING_DELTA,
                                        timestamp: Date.now(),
                                        data: { content: safeContent },
                                    }
                                    buffer = buffer.substring(safeLength)
                                    processed = true
                                }
                            }
                        } else if (parseState === 'todo') {
                            // 在 <todo> 内，寻找 </todo>
                            const todoEnd = buffer.indexOf('</todo>')
                            if (todoEnd !== -1) {
                                // 找到完整的 todo 标签
                                const todoContent = buffer.substring(0, todoEnd + 7)
                                const parsed = this.parseTodoList(todoContent)
                                
                                // 只有在还没创建过 TODO 时才创建
                                if (parsed && !hasTodoCreated) {
                                    hasTodoCreated = true
                                    currentTodoId = `todo-${Date.now()}`
                                    todoItemCounter = 0
                                    
                                    // 发出 TODO_START 事件
                                    yield {
                                        type: MCPLinkEventType.TODO_START,
                                        timestamp: Date.now(),
                                        data: {
                                            todoId: currentTodoId,
                                            todoTitle: parsed.title,
                                        },
                                    }
                                    
                                    // 发出每个 TODO_ITEM_ADD 事件
                                    for (const item of parsed.items) {
                                        todoItemCounter++
                                        yield {
                                            type: MCPLinkEventType.TODO_ITEM_ADD,
                                            timestamp: Date.now(),
                                            data: {
                                                todoId: currentTodoId,
                                                todoItemId: String(todoItemCounter),
                                                todoItemContent: item,
                                                todoItemStatus: 'pending',
                                            },
                                        }
                                    }
                                }
                                
                                parseState = 'normal'
                                buffer = buffer.substring(todoEnd + 7)
                                processed = true
                            }
                            // 等待完整的 todo 标签
                        } else if (parseState === 'tool_call') {
                            // 尝试多种结束标记
                            // 1. </tool_call> 标签
                            const toolEnd = buffer.indexOf('</tool_call>')
                            if (toolEnd !== -1) {
                                parseState = 'normal'
                                buffer = buffer.substring(toolEnd + 12)
                                processed = true
                                continue
                            }

                            // 2. ``` 代码块结束
                            if (buffer.startsWith('```')) {
                                const codeEnd = buffer.indexOf('```', 3)
                                if (codeEnd !== -1) {
                                    parseState = 'normal'
                                    buffer = buffer.substring(codeEnd + 3)
                                    processed = true
                                    continue
                                }
                            }

                            // 3. 裸 JSON 格式 - 检查括号是否匹配
                            if (buffer.startsWith('{')) {
                                let braceCount = 0
                                let jsonEnd = -1
                                for (let i = 0; i < buffer.length; i++) {
                                    if (buffer[i] === '{') braceCount++
                                    else if (buffer[i] === '}') {
                                        braceCount--
                                        if (braceCount === 0) {
                                            jsonEnd = i
                                            break
                                        }
                                    }
                                }
                                if (jsonEnd !== -1) {
                                    parseState = 'normal'
                                    buffer = buffer.substring(jsonEnd + 1)
                                    processed = true
                                    continue
                                }
                            }
                            // 工具调用内容不输出，继续等待
                        }
                    }
                } else if (chunk.type === 'finish') {
                    // 处理剩余缓冲
                    if (buffer.trim()) {
                        if (parseState === 'think') {
                            yield {
                                type: MCPLinkEventType.THINKING_DELTA,
                                timestamp: Date.now(),
                                data: { content: buffer },
                            }
                            yield { type: MCPLinkEventType.THINKING_END, timestamp: Date.now(), data: {} }
                        } else if (parseState === 'normal' && hasEndedThinking) {
                            if (!hasStartedText) {
                                hasStartedText = true
                                yield { type: MCPLinkEventType.TEXT_START, timestamp: Date.now(), data: {} }
                            }
                            yield {
                                type: MCPLinkEventType.TEXT_DELTA,
                                timestamp: Date.now(),
                                data: { content: buffer },
                            }
                        }
                        // tool_call 内容不输出
                    }
                    if (hasStartedText) {
                        yield { type: MCPLinkEventType.TEXT_END, timestamp: Date.now(), data: {} }
                    }
                }
            }

            // 检查完整响应中是否有工具调用
            const toolCall = this.parseToolCall(fullResponse)

            if (toolCall) {
                const toolCallId = `tool-${Date.now()}`

                // 发送工具调用事件
                yield {
                    type: MCPLinkEventType.TOOL_CALL_START,
                    timestamp: Date.now(),
                    data: {
                        toolName: toolCall.name,
                        toolCallId,
                        toolArgs: toolCall.arguments,
                    },
                }

                // 执行工具
                yield {
                    type: MCPLinkEventType.TOOL_EXECUTING,
                    timestamp: Date.now(),
                    data: {
                        toolName: toolCall.name,
                        toolCallId,
                        toolArgs: toolCall.arguments,
                    },
                }

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

                // 发送工具结果事件
                yield {
                    type: MCPLinkEventType.TOOL_RESULT,
                    timestamp: Date.now(),
                    data: {
                        toolName: toolCall.name,
                        toolResult: result,
                        toolCallId,
                        duration,
                        isError,
                    },
                }

                // 将 AI 的响应和工具结果添加到消息历史
                messages.push({
                    role: 'assistant',
                    content: fullResponse,
                })

                // 添加工具结果
                const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                messages.push({
                    role: 'user',
                    content: `<tool_result name="${toolCall.name}" success="${!isError}">\n${resultStr}\n</tool_result>\n\n请根据工具结果继续处理。如果任务已完成，请直接回复用户；如果需要更多信息，可以继续调用工具。`,
                })

                yield {
                    type: MCPLinkEventType.ITERATION_END,
                    timestamp: Date.now(),
                    data: { iteration },
                }

                // 继续下一轮迭代
                continue
            }

            // 没有工具调用，结束迭代
            yield {
                type: MCPLinkEventType.ITERATION_END,
                timestamp: Date.now(),
                data: { iteration },
            }
            break
        }

        // 完成
        yield {
            type: MCPLinkEventType.COMPLETE,
            timestamp: Date.now(),
            data: {
                totalDuration: Date.now() - startTime,
                totalIterations: iteration,
            },
        }
    }
}

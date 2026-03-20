import type { FastifyInstance } from 'fastify'
import { mcpLinkService } from '../services/MCPLinkService.js'
import { configService } from '../services/ConfigService.js'
import type { Conversation, ToolCallRecord } from '../types.js'

/**
 * 对话相关路由
 */
export async function chatRoutes(app: FastifyInstance) {
    /**
     * POST /api/chat
     * 发起对话
     *
     * 请求体:
     * - message: string (必填) - 用户消息
     * - modelId?: string - 指定模型 ID
     * - conversationId?: string - 会话 ID
     * - stream?: boolean - 是否流式响应，默认 true
     * - tools?: string[] - 允许使用的工具名称列表，为空或不传则使用所有工具
     * - images?: string[] - 图片数组（base64 格式）
     *
     * 响应:
     * - stream=true: SSE 流式响应
     * - stream=false: JSON 响应 { content, toolCalls, duration }
     */
    app.post('/api/chat', async (request, reply) => {
        const {
            message,
            modelId,
            conversationId,
            stream = true,
            tools,
            images,
        } = request.body as {
            message: string
            modelId?: string
            conversationId?: string
            stream?: boolean
            tools?: string[]
            images?: string[]
        }

        // 必须有消息或图片
        const hasMessage = message && message.trim().length > 0
        const hasImages = images && images.length > 0

        if (!hasMessage && !hasImages) {
            return reply.status(400).send({ error: 'Message or images is required' })
        }

        console.log(`[Chat] 📥 收到请求: 消息=${hasMessage ? '有' : '无'}, 图片数量=${images?.length || 0}`)

        // 获取历史消息
        let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
        if (conversationId) {
            const conversation = await configService.getConversation(conversationId)
            if (conversation && conversation.messages.length > 0) {
                history = conversation.messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }))
            }
        }

        const chatOptions: { tools?: string[]; history?: typeof history; images?: string[] } = {}
        if (tools && tools.length > 0) {
            chatOptions.tools = tools
        }
        if (history.length > 0) {
            chatOptions.history = history
        }
        if (images && images.length > 0) {
            chatOptions.images = images
        }

        // 非流式模式 - 直接返回 JSON
        if (!stream) {
            try {
                const startTime = Date.now()
                let content = ''
                const toolCalls: ToolCallRecord[] = []

                const chatStream = mcpLinkService.chat(
                    message,
                    modelId,
                    Object.keys(chatOptions).length > 0 ? chatOptions : undefined
                )

                for await (const event of chatStream) {
                    switch (event.type) {
                        case 'text_delta':
                            content += event.content || ''
                            break
                        case 'tool_call_start':
                            toolCalls.push({
                                name: event.toolName || '',
                                arguments: event.toolArgs || {},
                                result: undefined,
                                duration: 0,
                                status: 'pending',
                            })
                            break
                        case 'complete':
                            // 完成
                            break
                        case 'error':
                            throw event.error
                    }
                }

                const duration = Date.now() - startTime

                return {
                    success: true,
                    data: {
                        content,
                        toolCalls,
                        duration,
                    },
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                return reply.status(500).send({
                    success: false,
                    error: errorMessage,
                })
            }
        }

        // 流式模式 - SSE 响应
        const res = reply.raw

        // 禁用 TCP Nagle 算法，确保小数据包立即发送
        if (res.socket) {
            res.socket.setNoDelay(true)
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('X-Accel-Buffering', 'no') // 禁用 nginx 缓冲
        res.setHeader('Transfer-Encoding', 'chunked')

        // 禁用 Node.js 的输出缓冲
        res.flushHeaders()

        // 发送 SSE 事件的辅助函数 - 确保立即发送
        const sendEvent = (eventType: string, data: unknown) => {
            const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
            res.write(message)
            // 强制刷新缓冲区
            if (typeof (res as any).flush === 'function') {
                ;(res as any).flush()
            }
        }

        // 立即发送连接成功事件
        sendEvent('connected', { timestamp: Date.now() })

        console.log(`[Chat] 🚀 开始处理消息: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`)
        console.log(`[Chat]    模型: ${modelId || '默认'}, 会话: ${conversationId || '无'}`)

        try {
            const chatStream = mcpLinkService.chat(
                message,
                modelId,
                Object.keys(chatOptions).length > 0 ? chatOptions : undefined
            )

            let eventCount = 0
            for await (const event of chatStream) {
                eventCount++

                // 详细日志
                if (event.type === 'tool_call_start') {
                    console.log(`[Chat] 📤 发送事件 #${eventCount}: ${event.type} (${event.toolName})`)
                } else if (event.type !== 'text_delta') {
                    console.log(`[Chat] 📤 发送事件 #${eventCount}: ${event.type}`)
                }

                // 发送事件（标准事件流）
                switch (event.type) {
                    case 'text_start':
                        sendEvent('text_start', {})
                        break
                    case 'text_delta':
                        sendEvent('text_delta', { content: event.content })
                        break
                    case 'text_end':
                        sendEvent('text_end', {})
                        break
                    case 'thinking_start':
                        sendEvent('thinking_start', {})
                        break
                    case 'thinking_delta':
                        sendEvent('thinking_delta', { content: event.content })
                        break
                    case 'thinking_end':
                        sendEvent('thinking_end', {})
                        break
                    case 'tool_call_start':
                        sendEvent('tool_call_start', {
                            toolName: event.toolName,
                            toolCallId: event.toolCallId,
                            toolArgs: event.toolArgs,
                        })
                        break
                    case 'tool_call_delta':
                        sendEvent('tool_call_delta', {
                            toolCallId: event.toolCallId,
                            argsTextDelta: event.argsTextDelta,
                        })
                        break
                    case 'tool_call_end':
                        sendEvent('tool_call_end', { toolCallId: event.toolCallId })
                        break
                    case 'tool_executing':
                        sendEvent('tool_executing', {
                            toolCallId: event.toolCallId,
                            toolName: event.toolName,
                        })
                        break
                    case 'tool_result':
                        sendEvent('tool_result', {
                            toolName: event.toolName,
                            toolCallId: event.toolCallId,
                            toolResult: event.toolResult,
                            duration: event.duration,
                            isError: event.isError,
                        })
                        break
                    case 'iteration_start':
                        sendEvent('iteration_start', {
                            iteration: event.iteration,
                            maxIterations: event.maxIterations,
                        })
                        break
                    case 'iteration_end':
                        sendEvent('iteration_end', { iteration: event.iteration })
                        break
                    case 'complete':
                        sendEvent('complete', {
                            totalIterations: event.totalIterations,
                            totalDuration: event.totalDuration,
                        })
                        break
                    case 'error':
                        sendEvent('error', { error: event.error.message })
                        break
                }
            }

            console.log(`[Chat] ✅ 消息处理完成，共发送 ${eventCount} 个事件`)
            res.end()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error(`[Chat] ❌ 处理消息时出错:`, error)
            sendEvent('error', { error: errorMessage })
            res.end()
        }
    })

    /**
     * GET /api/conversations
     * 获取会话列表
     */
    app.get('/api/conversations', async () => {
        const conversations = await configService.getConversations()
        return { conversations }
    })

    /**
     * GET /api/conversations/:id
     * 获取单个会话
     */
    app.get('/api/conversations/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const conversation = await configService.getConversation(id)

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' })
        }

        return { conversation }
    })

    /**
     * POST /api/conversations
     * 创建新会话
     */
    app.post('/api/conversations', async (request) => {
        const { title, modelId } = request.body as { title?: string; modelId?: string }

        const settings = await configService.getSettings()
        const conversation: Conversation = {
            id: crypto.randomUUID(),
            title: title || '新对话',
            modelId: modelId || settings.defaultModelId || '',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }

        await configService.addConversation(conversation)
        return { conversation }
    })

    /**
     * PUT /api/conversations/:id
     * 更新会话
     */
    app.put('/api/conversations/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const updates = request.body as Partial<Conversation>

        const existing = await configService.getConversation(id)
        if (!existing) {
            return reply.status(404).send({ error: 'Conversation not found' })
        }

        await configService.updateConversation(id, updates)
        const updated = await configService.getConversation(id)
        return { conversation: updated }
    })

    /**
     * DELETE /api/conversations/:id
     * 删除会话
     */
    app.delete('/api/conversations/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        const existing = await configService.getConversation(id)
        if (!existing) {
            return reply.status(404).send({ error: 'Conversation not found' })
        }

        await configService.deleteConversation(id)
        return { success: true }
    })

    /**
     * DELETE /api/conversations
     * 删除全部会话
     */
    app.delete('/api/conversations', async () => {
        await configService.deleteAllConversations()
        return { success: true }
    })

    /**
     * POST /api/conversations/:id/generate-title
     * 为会话生成标题
     */
    app.post('/api/conversations/:id/generate-title', async (request, reply) => {
        const { id } = request.params as { id: string }
        const { userMessage, assistantMessage } = request.body as {
            userMessage: string
            assistantMessage?: string
        }

        if (!userMessage) {
            return reply.status(400).send({ error: 'userMessage is required' })
        }

        const conversation = await configService.getConversation(id)
        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' })
        }

        try {
            const title = await mcpLinkService.generateTitle(userMessage, assistantMessage)
            await configService.updateConversation(id, { title })
            return { title }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return reply.status(500).send({ error: errorMessage })
        }
    })
}

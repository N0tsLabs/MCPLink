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
        } = request.body as {
            message: string
            modelId?: string
            conversationId?: string
            stream?: boolean
            tools?: string[]
        }

        if (!message) {
            return reply.status(400).send({ error: 'Message is required' })
        }

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

        const chatOptions: { tools?: string[]; history?: typeof history } = {}
        if (tools && tools.length > 0) {
            chatOptions.tools = tools
        }
        if (history.length > 0) {
            chatOptions.history = history
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
                            content += event.data.content || ''
                            break
                        case 'tool_call_start':
                            toolCalls.push({
                                name: event.data.toolName || '',
                                arguments: event.data.toolArgs || {},
                                result: undefined,
                                duration: 0,
                                status: 'pending',
                            })
                            break
                        case 'tool_result':
                            const tool = toolCalls.find((t) => t.name === event.data.toolName && t.status === 'pending')
                            if (tool) {
                                tool.result = event.data.toolResult
                                tool.duration = event.data.duration || 0
                                tool.status = event.data.isError ? 'error' : 'success'
                            }
                            break
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

        try {
            const chatStream = mcpLinkService.chat(
                message,
                modelId,
                Object.keys(chatOptions).length > 0 ? chatOptions : undefined
            )

            for await (const event of chatStream) {
                sendEvent(event.type, event.data)
            }

            res.end()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
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

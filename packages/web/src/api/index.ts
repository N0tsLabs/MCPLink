import axios, { type AxiosInstance } from 'axios'
import type { Model, MCPServer, MCPTool, Conversation, Settings, SSEEvent } from './types'

class Api {
    private client: AxiosInstance
    private baseUrl: string = 'http://localhost:3000'

    constructor() {
        this.client = axios.create({
            timeout: 30000,
            baseURL: this.baseUrl,
        })
    }

    setBaseUrl(url: string) {
        this.baseUrl = url.replace(/\/$/, '')
        this.client.defaults.baseURL = this.baseUrl
    }

    getBaseUrl() {
        return this.baseUrl
    }

    // ============ 健康检查 ============

    async healthCheck() {
        const res = await this.client.get('/api/health')
        return res.data
    }

    // ============ 模型管理 ============

    async getModels(): Promise<{ models: Model[] }> {
        const res = await this.client.get('/api/models')
        return res.data
    }

    async getModel(id: string): Promise<{ model: Model }> {
        const res = await this.client.get(`/api/models/${id}`)
        return res.data
    }

    async createModel(model: Omit<Model, 'id'>): Promise<{ model: Model }> {
        const res = await this.client.post('/api/models', model)
        return res.data
    }

    async updateModel(id: string, updates: Partial<Model>): Promise<{ model: Model }> {
        const res = await this.client.put(`/api/models/${id}`, updates)
        return res.data
    }

    async deleteModel(id: string): Promise<void> {
        await this.client.delete(`/api/models/${id}`)
    }

    async toggleModel(id: string): Promise<{ model: Model }> {
        const res = await this.client.put(`/api/models/${id}/toggle`)
        return res.data
    }

    /**
     * 从远程 API 获取可用模型列表
     */
    async fetchRemoteModels(baseURL: string, apiKey: string): Promise<{ models: string[]; success: boolean }> {
        const res = await this.client.post('/api/models/fetch-remote', { baseURL, apiKey })
        return res.data
    }

    /**
     * 批量添加模型
     */
    async createModelsBatch(
        models: string[],
        baseURL: string,
        apiKey: string
    ): Promise<{ models: Model[]; count: number }> {
        const res = await this.client.post('/api/models/batch', { models, baseURL, apiKey })
        return res.data
    }

    // ============ MCP 服务器管理 ============

    async getMCPServers(): Promise<{ servers: MCPServer[] }> {
        const res = await this.client.get('/api/mcp/servers')
        return res.data
    }

    async getMCPServer(id: string): Promise<{ server: MCPServer }> {
        const res = await this.client.get(`/api/mcp/servers/${id}`)
        return res.data
    }

    async createMCPServer(server: Omit<MCPServer, 'id'>): Promise<{ server: MCPServer }> {
        const res = await this.client.post('/api/mcp/servers', server)
        return res.data
    }

    async updateMCPServer(id: string, updates: Partial<MCPServer>): Promise<{ server: MCPServer }> {
        const res = await this.client.put(`/api/mcp/servers/${id}`, updates)
        return res.data
    }

    async deleteMCPServer(id: string): Promise<void> {
        await this.client.delete(`/api/mcp/servers/${id}`)
    }

    async startMCPServer(id: string): Promise<void> {
        await this.client.post(`/api/mcp/servers/${id}/start`)
    }

    async stopMCPServer(id: string): Promise<void> {
        await this.client.post(`/api/mcp/servers/${id}/stop`)
    }

    async getMCPServerTools(id: string): Promise<{ tools: MCPServer['tools'] }> {
        const res = await this.client.get(`/api/mcp/servers/${id}/tools`)
        return res.data
    }

    async getAllTools(): Promise<{ tools: MCPTool[] }> {
        const res = await this.client.get('/api/mcp/tools')
        return res.data
    }

    // ============ 会话管理 ============

    async getConversations(): Promise<{ conversations: Conversation[] }> {
        const res = await this.client.get('/api/conversations')
        return res.data
    }

    async getConversation(id: string): Promise<{ conversation: Conversation }> {
        const res = await this.client.get(`/api/conversations/${id}`)
        return res.data
    }

    async createConversation(data: { title?: string; modelId?: string }): Promise<{ conversation: Conversation }> {
        const res = await this.client.post('/api/conversations', data)
        return res.data
    }

    async updateConversation(id: string, updates: Partial<Conversation>): Promise<{ conversation: Conversation }> {
        const res = await this.client.put(`/api/conversations/${id}`, updates)
        return res.data
    }

    async deleteConversation(id: string): Promise<void> {
        await this.client.delete(`/api/conversations/${id}`)
    }

    async deleteAllConversations(): Promise<void> {
        await this.client.delete('/api/conversations')
    }

    /**
     * 为会话生成标题
     */
    async generateConversationTitle(
        id: string,
        userMessage: string,
        assistantMessage?: string
    ): Promise<{ title: string }> {
        const res = await this.client.post(`/api/conversations/${id}/generate-title`, {
            userMessage,
            assistantMessage,
        })
        return res.data
    }

    // ============ 配置管理 ============

    async getSettings(): Promise<{ settings: Settings }> {
        const res = await this.client.get('/api/config')
        return res.data
    }

    async updateSettings(settings: Partial<Settings>): Promise<{ settings: Settings }> {
        const res = await this.client.put('/api/config', settings)
        return res.data
    }

    /**
     * 获取默认系统提示词
     */
    async getDefaultPrompt(): Promise<{ prompt: string }> {
        const res = await this.client.get('/api/config/default-prompt')
        return res.data
    }

    // ============ 对话 ============

    /**
     * 发起对话（SSE 流式）
     * @param message 文本消息
     * @param options.images 图片数组（base64 格式）
     */
    chat(
        message: string,
        options: {
            modelId?: string
            conversationId?: string
            tools?: string[]
            images?: string[]  // base64 图片数组
            onEvent: (event: SSEEvent) => void
            onError?: (error: Error) => void
            onComplete?: () => void
        }
    ): AbortController {
        const controller = new AbortController()

        const url = `${this.baseUrl}/api/chat`

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                modelId: options.modelId,
                conversationId: options.conversationId,
                tools: options.tools,
                images: options.images,
            }),
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }

                const reader = response.body?.getReader()
                if (!reader) {
                    throw new Error('No response body')
                }

                const decoder = new TextDecoder()
                let buffer = ''
                let currentEvent: string | null = null  // 移到循环外，保持跨 chunk 状态

                while (true) {
                    const { done, value } = await reader.read()

                    if (done) {
                        options.onComplete?.()
                        break
                    }

                    buffer += decoder.decode(value, { stream: true })

                    // 解析 SSE 事件
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7)
                        } else if (line.startsWith('data: ') && currentEvent) {
                            try {
                                const data = JSON.parse(line.slice(6))
                                options.onEvent({
                                    type: currentEvent as SSEEvent['type'],
                                    data,
                                })
                            } catch {
                                // 忽略解析错误
                            }
                            currentEvent = null
                        }
                    }
                }
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    options.onError?.(error)
                }
            })

        return controller
    }
}

export const api = new Api()

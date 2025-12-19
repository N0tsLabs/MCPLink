import axios from 'axios';
class Api {
    client;
    baseUrl = 'http://localhost:3000';
    constructor() {
        this.client = axios.create({
            timeout: 30000,
            baseURL: this.baseUrl,
        });
    }
    setBaseUrl(url) {
        this.baseUrl = url.replace(/\/$/, '');
        this.client.defaults.baseURL = this.baseUrl;
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    // ============ 健康检查 ============
    async healthCheck() {
        const res = await this.client.get('/api/health');
        return res.data;
    }
    // ============ 模型管理 ============
    async getModels() {
        const res = await this.client.get('/api/models');
        return res.data;
    }
    async getModel(id) {
        const res = await this.client.get(`/api/models/${id}`);
        return res.data;
    }
    async createModel(model) {
        const res = await this.client.post('/api/models', model);
        return res.data;
    }
    async updateModel(id, updates) {
        const res = await this.client.put(`/api/models/${id}`, updates);
        return res.data;
    }
    async deleteModel(id) {
        await this.client.delete(`/api/models/${id}`);
    }
    async toggleModel(id) {
        const res = await this.client.put(`/api/models/${id}/toggle`);
        return res.data;
    }
    /**
     * 从远程 API 获取可用模型列表
     */
    async fetchRemoteModels(baseURL, apiKey) {
        const res = await this.client.post('/api/models/fetch-remote', { baseURL, apiKey });
        return res.data;
    }
    /**
     * 批量添加模型
     */
    async createModelsBatch(models, baseURL, apiKey) {
        const res = await this.client.post('/api/models/batch', { models, baseURL, apiKey });
        return res.data;
    }
    // ============ MCP 服务器管理 ============
    async getMCPServers() {
        const res = await this.client.get('/api/mcp/servers');
        return res.data;
    }
    async getMCPServer(id) {
        const res = await this.client.get(`/api/mcp/servers/${id}`);
        return res.data;
    }
    async createMCPServer(server) {
        const res = await this.client.post('/api/mcp/servers', server);
        return res.data;
    }
    async updateMCPServer(id, updates) {
        const res = await this.client.put(`/api/mcp/servers/${id}`, updates);
        return res.data;
    }
    async deleteMCPServer(id) {
        await this.client.delete(`/api/mcp/servers/${id}`);
    }
    async startMCPServer(id) {
        await this.client.post(`/api/mcp/servers/${id}/start`);
    }
    async stopMCPServer(id) {
        await this.client.post(`/api/mcp/servers/${id}/stop`);
    }
    async getMCPServerTools(id) {
        const res = await this.client.get(`/api/mcp/servers/${id}/tools`);
        return res.data;
    }
    async getAllTools() {
        const res = await this.client.get('/api/mcp/tools');
        return res.data;
    }
    // ============ 会话管理 ============
    async getConversations() {
        const res = await this.client.get('/api/conversations');
        return res.data;
    }
    async getConversation(id) {
        const res = await this.client.get(`/api/conversations/${id}`);
        return res.data;
    }
    async createConversation(data) {
        const res = await this.client.post('/api/conversations', data);
        return res.data;
    }
    async updateConversation(id, updates) {
        const res = await this.client.put(`/api/conversations/${id}`, updates);
        return res.data;
    }
    async deleteConversation(id) {
        await this.client.delete(`/api/conversations/${id}`);
    }
    /**
     * 为会话生成标题
     */
    async generateConversationTitle(id, userMessage, assistantMessage) {
        const res = await this.client.post(`/api/conversations/${id}/generate-title`, {
            userMessage,
            assistantMessage,
        });
        return res.data;
    }
    // ============ 配置管理 ============
    async getSettings() {
        const res = await this.client.get('/api/config');
        return res.data;
    }
    async updateSettings(settings) {
        const res = await this.client.put('/api/config', settings);
        return res.data;
    }
    /**
     * 获取默认系统提示词
     */
    async getDefaultPrompt() {
        const res = await this.client.get('/api/config/default-prompt');
        return res.data;
    }
    // ============ 对话 ============
    /**
     * 发起对话（SSE 流式）
     */
    chat(message, options) {
        const controller = new AbortController();
        const url = `${this.baseUrl}/api/chat`;
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
            }),
            signal: controller.signal,
        })
            .then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    options.onComplete?.();
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                // 解析 SSE 事件
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                let currentEvent = null;
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7);
                    }
                    else if (line.startsWith('data: ') && currentEvent) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            options.onEvent({
                                type: currentEvent,
                                data,
                            });
                        }
                        catch {
                            // 忽略解析错误
                        }
                        currentEvent = null;
                    }
                }
            }
        })
            .catch((error) => {
            if (error.name !== 'AbortError') {
                options.onError?.(error);
            }
        });
        return controller;
    }
}
export const api = new Api();

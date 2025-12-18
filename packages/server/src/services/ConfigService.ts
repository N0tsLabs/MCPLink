import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModelConfig, MCPServerConfigWithId, SystemConfig, Conversation } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = path.resolve(__dirname, '../../config')

/**
 * 配置服务
 * 负责读写配置文件
 */
export class ConfigService {
    private configDir: string

    constructor(configDir?: string) {
        this.configDir = configDir || CONFIG_DIR
    }

    /**
     * 确保配置目录存在
     */
    async ensureConfigDir(): Promise<void> {
        try {
            await fs.access(this.configDir)
        } catch {
            await fs.mkdir(this.configDir, { recursive: true })
        }
    }

    /**
     * 读取 JSON 文件
     */
    private async readJson<T>(filename: string, defaultValue: T): Promise<T> {
        const filepath = path.join(this.configDir, filename)
        try {
            const content = await fs.readFile(filepath, 'utf-8')
            return JSON.parse(content) as T
        } catch {
            return defaultValue
        }
    }

    /**
     * 写入 JSON 文件
     */
    private async writeJson<T>(filename: string, data: T): Promise<void> {
        await this.ensureConfigDir()
        const filepath = path.join(this.configDir, filename)
        await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')
    }

    // ============ 模型配置 ============

    async getModels(): Promise<ModelConfig[]> {
        const data = await this.readJson<{ models: ModelConfig[] }>('models.json', { models: [] })
        return data.models
    }

    async saveModels(models: ModelConfig[]): Promise<void> {
        await this.writeJson('models.json', { models })
    }

    async getModel(id: string): Promise<ModelConfig | undefined> {
        const models = await this.getModels()
        return models.find((m) => m.id === id)
    }

    async addModel(model: ModelConfig): Promise<void> {
        const models = await this.getModels()
        models.push(model)
        await this.saveModels(models)
    }

    async updateModel(id: string, updates: Partial<ModelConfig>): Promise<void> {
        const models = await this.getModels()
        const index = models.findIndex((m) => m.id === id)
        if (index !== -1) {
            models[index] = { ...models[index], ...updates }
            await this.saveModels(models)
        }
    }

    async deleteModel(id: string): Promise<void> {
        const models = await this.getModels()
        const filtered = models.filter((m) => m.id !== id)
        await this.saveModels(filtered)
    }

    // ============ MCP 服务器配置 ============

    async getMCPServers(): Promise<MCPServerConfigWithId[]> {
        const data = await this.readJson<{ servers: MCPServerConfigWithId[] }>('mcp-servers.json', { servers: [] })
        return data.servers
    }

    async saveMCPServers(servers: MCPServerConfigWithId[]): Promise<void> {
        await this.writeJson('mcp-servers.json', { servers })
    }

    async getMCPServer(id: string): Promise<MCPServerConfigWithId | undefined> {
        const servers = await this.getMCPServers()
        return servers.find((s) => s.id === id)
    }

    async addMCPServer(server: MCPServerConfigWithId): Promise<void> {
        const servers = await this.getMCPServers()
        servers.push(server)
        await this.saveMCPServers(servers)
    }

    async updateMCPServer(id: string, updates: Partial<MCPServerConfigWithId>): Promise<void> {
        const servers = await this.getMCPServers()
        const index = servers.findIndex((s) => s.id === id)
        if (index !== -1) {
            servers[index] = { ...servers[index], ...updates }
            await this.saveMCPServers(servers)
        }
    }

    async deleteMCPServer(id: string): Promise<void> {
        const servers = await this.getMCPServers()
        const filtered = servers.filter((s) => s.id !== id)
        await this.saveMCPServers(filtered)
    }

    // ============ 系统设置 ============

    async getSettings(): Promise<SystemConfig> {
        return this.readJson<SystemConfig>('settings.json', {
            maxIterations: 10,
            systemPrompt: '',
        })
    }

    async saveSettings(settings: SystemConfig): Promise<void> {
        await this.writeJson('settings.json', settings)
    }

    // ============ 会话管理 ============

    async getConversations(): Promise<Conversation[]> {
        const data = await this.readJson<{ conversations: Conversation[] }>('conversations.json', { conversations: [] })
        return data.conversations
    }

    async saveConversations(conversations: Conversation[]): Promise<void> {
        await this.writeJson('conversations.json', { conversations })
    }

    async getConversation(id: string): Promise<Conversation | undefined> {
        const conversations = await this.getConversations()
        return conversations.find((c) => c.id === id)
    }

    async addConversation(conversation: Conversation): Promise<void> {
        const conversations = await this.getConversations()
        conversations.unshift(conversation) // 新会话放在最前面
        await this.saveConversations(conversations)
    }

    async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
        const conversations = await this.getConversations()
        const index = conversations.findIndex((c) => c.id === id)
        if (index !== -1) {
            conversations[index] = { ...conversations[index], ...updates, updatedAt: Date.now() }
            await this.saveConversations(conversations)
        }
    }

    async deleteConversation(id: string): Promise<void> {
        const conversations = await this.getConversations()
        const filtered = conversations.filter((c) => c.id !== id)
        await this.saveConversations(filtered)
    }
}

// 单例
export const configService = new ConfigService()

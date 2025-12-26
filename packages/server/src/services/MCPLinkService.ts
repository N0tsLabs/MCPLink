import { MCPLink, type MCPServerConfig, type MCPLinkEvent } from '@mcplink/core'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, type LanguageModel } from 'ai'
import { configService } from './ConfigService.js'
import type { ModelConfig, MCPServerConfigWithId } from '../types.js'

/**
 * MCPLink 服务
 * 管理 MCPLink 实例，提供对话能力
 */
export class MCPLinkService {
    private mcpLink: MCPLink | null = null
    private currentModelId: string | null = null
    private reinitializeTimer: ReturnType<typeof setTimeout> | null = null
    private isReinitializing = false

    /**
     * 根据模型配置创建 LanguageModel
     * 统一使用 OpenAI 兼容接口，通过 baseURL 支持各种代理
     */
    private createModel(config: ModelConfig): LanguageModel {
        const provider = createOpenAI({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
        })
        return provider(config.model)
    }

    /**
     * 将配置转换为 MCPServerConfig
     */
    private convertMCPServerConfig(config: MCPServerConfigWithId): MCPServerConfig {
        if (config.type === 'sse') {
            return {
                type: 'sse',
                url: config.url!,
                headers: config.headers,
            }
        } else {
            return {
                type: 'stdio',
                command: config.command!,
                args: config.args,
                env: config.env,
            }
        }
    }

    /**
     * 初始化 MCPLink 实例
     * @param modelId 可选的模型 ID，如果不存在会自动回退到其他可用模型
     */
    async initialize(modelId?: string): Promise<void> {
        // 获取模型配置
        const models = await configService.getModels()
        const enabledModels = models.filter((m) => m.enabled)

        // 如果没有可用模型，仅初始化 MCP（不初始化 AI 模型）
        if (enabledModels.length === 0) {
            console.warn('[MCPLinkService] 没有可用的模型，仅初始化 MCP 服务')
            await this.initializeMCPOnly()
            return
        }

        // 选择模型（带回退逻辑）
        let modelConfig: ModelConfig
        if (modelId) {
            const found = enabledModels.find((m) => m.id === modelId)
            if (!found) {
                // 回退到默认模型或第一个可用模型
                console.warn(`[MCPLinkService] 模型 "${modelId}" 不存在或已禁用，自动切换到其他模型`)
                const settings = await configService.getSettings()
                const defaultModel = enabledModels.find((m) => m.id === settings.defaultModelId)
                modelConfig = defaultModel || enabledModels[0]
            } else {
                modelConfig = found
            }
        } else {
            const settings = await configService.getSettings()
            const defaultModel = enabledModels.find((m) => m.id === settings.defaultModelId)
            modelConfig = defaultModel || enabledModels[0]
        }

        // 获取 MCP 服务器配置
        const mcpServers = await configService.getMCPServers()
        const enabledServers = mcpServers.filter((s) => s.enabled)

        // 获取系统设置
        const settings = await configService.getSettings()

        // 创建 MCPLink 实例
        const model = this.createModel(modelConfig)

        const mcpServerConfigs: Record<string, MCPServerConfig> = {}
        for (const server of enabledServers) {
            mcpServerConfigs[server.id] = this.convertMCPServerConfig(server)
        }

        // 关闭旧实例
        if (this.mcpLink) {
            await this.mcpLink.close()
        }

        this.mcpLink = new MCPLink({
            model,
            modelName: modelConfig.model, // 传递实际的模型名称用于检测
            mcpServers: mcpServerConfigs,
            systemPrompt: settings.systemPrompt,
            maxIterations: settings.maxIterations,
            usePromptBasedTools: settings.usePromptBasedTools,
            enableThinkingPhase: settings.enableThinkingPhase,
            thinkingPhasePrompt: settings.thinkingPhasePrompt,
            thinkingMaxTokens: settings.thinkingMaxTokens,
            immediateResultMatchers: settings.immediateResultMatchers,
        })

        this.currentModelId = modelConfig.id

        // 初始化连接
        await this.mcpLink.initialize()
    }

    /**
     * 确保已初始化
     */
    private async ensureInitialized(): Promise<MCPLink> {
        if (!this.mcpLink) {
            await this.initialize()
        }
        return this.mcpLink!
    }

    /**
     * 发起对话（流式）
     * @param message 用户消息
     * @param modelId 模型 ID
     * @param options 可选参数
     * @param options.tools 允许使用的工具名称列表
     * @param options.history 历史消息列表
     */
    async *chat(
        message: string,
        modelId?: string,
        options?: {
            tools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
    ): AsyncGenerator<MCPLinkEvent> {
        // 如果指定了不同的模型，重新初始化
        if (modelId && modelId !== this.currentModelId) {
            await this.initialize(modelId)
        }

        const mcpLink = await this.ensureInitialized()
        yield* mcpLink.chatStream(message, {
            allowedTools: options?.tools,
            history: options?.history,
        })
    }

    /**
     * 获取所有可用工具
     */
    async getTools() {
        const mcpLink = await this.ensureInitialized()
        return mcpLink.getTools()
    }

    /**
     * 获取 MCP 服务器状态
     */
    async getMCPServerStatuses() {
        const mcpLink = await this.ensureInitialized()
        return mcpLink.getMCPServerStatuses()
    }

    /**
     * 启动 MCP 服务器
     */
    async startMCPServer(id: string) {
        const mcpLink = await this.ensureInitialized()
        await mcpLink.startMCPServer(id)
    }

    /**
     * 停止 MCP 服务器
     */
    async stopMCPServer(id: string) {
        const mcpLink = await this.ensureInitialized()
        await mcpLink.stopMCPServer(id)
    }

    /**
     * 仅初始化 MCP 服务（不需要模型时使用）
     */
    private async initializeMCPOnly(): Promise<void> {
        // 获取 MCP 服务器配置
        const mcpServers = await configService.getMCPServers()
        const enabledServers = mcpServers.filter((s) => s.enabled)

        const mcpServerConfigs: Record<string, MCPServerConfig> = {}
        for (const server of enabledServers) {
            mcpServerConfigs[server.id] = this.convertMCPServerConfig(server)
        }

        // 关闭旧实例
        if (this.mcpLink) {
            await this.mcpLink.close()
        }

        // 创建一个临时的占位模型（不会实际使用）
        const placeholderProvider = createOpenAI({
            baseURL: 'http://localhost',
            apiKey: 'placeholder',
        })

        this.mcpLink = new MCPLink({
            model: placeholderProvider('placeholder'),
            modelName: 'placeholder',
            mcpServers: mcpServerConfigs,
        })

        this.currentModelId = null

        // 初始化 MCP 连接
        await this.mcpLink.initialize()
    }

    /**
     * 重新初始化（配置变更后调用）
     * 使用防抖机制，避免频繁重新初始化
     */
    async reinitialize(): Promise<void> {
        // 清除之前的定时器
        if (this.reinitializeTimer) {
            clearTimeout(this.reinitializeTimer)
            this.reinitializeTimer = null
        }

        // 如果正在重新初始化，延迟执行
        if (this.isReinitializing) {
            return new Promise((resolve) => {
                this.reinitializeTimer = setTimeout(() => {
                    this.reinitialize().then(resolve).catch(resolve)
                }, 500)
            })
        }

        // 防抖：等待 300ms 后执行，合并多次快速调用
        return new Promise((resolve) => {
            this.reinitializeTimer = setTimeout(async () => {
                this.isReinitializing = true
                try {
                    await this.initialize(this.currentModelId || undefined)
                } catch (error) {
                    // 记录错误但不崩溃
                    console.error('[MCPLinkService] 重新初始化失败:', error)
                } finally {
                    this.isReinitializing = false
                }
                resolve()
            }, 300)
        })
    }

    /**
     * 关闭
     */
    async close(): Promise<void> {
        if (this.mcpLink) {
            await this.mcpLink.close()
            this.mcpLink = null
        }
    }

    /**
     * 生成对话标题
     * @param userMessage 用户首条消息
     * @param assistantMessage AI 首条回复（可选）
     */
    async generateTitle(userMessage: string, assistantMessage?: string): Promise<string> {
        // 获取模型配置
        const models = await configService.getModels()
        const enabledModels = models.filter((m) => m.enabled)

        if (enabledModels.length === 0) {
            return '新对话'
        }

        // 使用第一个启用的模型
        const settings = await configService.getSettings()
        const defaultModel = enabledModels.find((m) => m.id === settings.defaultModelId)
        const modelConfig = defaultModel || enabledModels[0]
        const model = this.createModel(modelConfig)

        const prompt = assistantMessage
            ? `根据以下对话内容，生成一个简短的中文标题（5-15个字，不要使用引号）：

用户：${userMessage}
助手：${assistantMessage.slice(0, 200)}

标题：`
            : `根据以下用户消息，生成一个简短的中文标题（5-15个字，不要使用引号）：

${userMessage}

标题：`

        try {
            const result = await generateText({
                model,
                prompt,
                maxTokens: 50,
            })

            // 清理标题（移除引号、换行等）
            const title = result.text
                .replace(/["""'']/g, '')
                .replace(/\n/g, '')
                .trim()
                .slice(0, 30) // 限制长度

            return title || '新对话'
        } catch (error) {
            console.error('Failed to generate title:', error)
            return '新对话'
        }
    }
}

// 单例
export const mcpLinkService = new MCPLinkService()

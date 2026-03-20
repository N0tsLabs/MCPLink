import { MCPLink, type MCPServerConfig, type AIStreamEvent, type Message, type ChatResult, toStandardStream, type StandardStreamEvent } from '@n0ts123/mcplink-core'
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
     * 将模型配置转换为 AIRequestConfig
     */
    private createAIConfig(config: ModelConfig): { baseURL: string; apiKey: string; model: string; [key: string]: unknown } {
        return {
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            model: config.model,
            // 可以传递额外参数
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            enable_thinking: config.enableThinking ?? false,  // 默认关闭思考
            // 其他自定义参数
            ...config.extraParams,
        }
    }

    /**
     * 将配置转换为 MCPServerConfig
     */
    private convertMCPServerConfig(config: MCPServerConfigWithId): MCPServerConfig {
        if (config.type === 'streamable-http' || config.url) {
            return {
                type: 'streamable-http',
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

        // 创建 AI 配置
        const aiConfig = this.createAIConfig(modelConfig)

        const mcpServerConfigs: Record<string, MCPServerConfig> = {}
        for (const server of enabledServers) {
            mcpServerConfigs[server.id] = this.convertMCPServerConfig(server)
        }

        // 关闭旧实例
        if (this.mcpLink) {
            await this.mcpLink.close()
        }

        this.mcpLink = new MCPLink({
            ai: aiConfig,
            adapter: 'openai',
            mcpServers: mcpServerConfigs,
            maxIterations: settings.maxIterations,
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
     * 发起对话（流式 - 标准事件流）
     * @param message 用户消息
     * @param modelId 模型 ID
     * @param options 可选参数
     * @param options.tools 允许使用的工具名称列表
     * @param options.history 历史消息列表
     * @param options.images 图片数组（base64 格式）- 暂不支持，需要手动构建消息
     */
    async *chat(
        message: string,
        modelId?: string,
        options?: {
            tools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
            images?: string[]
        }
    ): AsyncGenerator<StandardStreamEvent> {
        // 如果指定了不同的模型，重新初始化
        if (modelId && modelId !== this.currentModelId) {
            await this.initialize(modelId)
        }

        const mcpLink = await this.ensureInitialized()

        // 构建消息历史
        const settings = await configService.getSettings()
        const messages: Message[] = []

        // 添加系统提示词
        if (settings.systemPrompt) {
            messages.push({ role: 'system', content: settings.systemPrompt })
        }

        // 添加历史消息
        if (options?.history) {
            for (const msg of options.history) {
                messages.push({ role: msg.role, content: msg.content })
            }
        }

        // 添加当前用户消息
        messages.push({ role: 'user', content: message })

        // 获取 MCP 工具
        const tools = await mcpLink.getTools()

        // 创建底层事件流生成器
        async function* rawEventStream(): AsyncGenerator<AIStreamEvent> {
            // 使用队列来收集流式事件
            const eventQueue: AIStreamEvent[] = []
            let streamDone = false
            let streamError: Error | null = null

            // 启动流式请求（在后台收集事件）
            const streamPromise = mcpLink.chatStream(
                messages,
                (event) => {
                    eventQueue.push(event)
                    return true
                }
            ).then(
                result => {
                    streamDone = true
                    return result
                },
                error => {
                    streamError = error
                    streamDone = true
                    throw error
                }
            )

            // 消费队列中的事件
            while (!streamDone || eventQueue.length > 0) {
                // 如果有事件，立即 yield
                if (eventQueue.length > 0) {
                    const event = eventQueue.shift()!
                    yield event
                } else {
                    // 等待新事件或流结束
                    await new Promise(resolve => setTimeout(resolve, 10))
                }
            }

            // 等待流完成（获取最终结果，但不需要再 yield，因为事件已经处理过了）
            try {
                await streamPromise
            } catch (error) {
                if (streamError) {
                    yield { type: 'error', error: streamError }
                }
            }

            yield { type: 'done' }
        }

        // 使用标准事件流转换
        yield* toStandardStream(rawEventStream(), {
            maxIterations: settings.maxIterations ?? 10,
            executeTool: async (name: string, args: Record<string, unknown>) => {
                return await mcpLink.callTool(name, args)
            },
        })
    }

    /**
     * 发起对话（新版流式）
     * 返回完整的结果和消息历史
     */
    async chatStream(
        messages: Message[],
        onStream?: (event: AIStreamEvent) => boolean | void
    ): Promise<ChatResult> {
        const mcpLink = await this.ensureInitialized()

        return mcpLink.chat({
            messages,
            stream: true,
            onStream,
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

        // 创建一个临时的占位 AI 配置（不会实际使用）
        this.mcpLink = new MCPLink({
            ai: {
                baseURL: 'http://localhost',
                apiKey: 'placeholder',
                model: 'placeholder',
            },
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

        const prompt = assistantMessage
            ? `根据以下对话内容，生成一个简短的中文标题（5-15个字，不要使用引号）：

用户：${userMessage}
助手：${assistantMessage.slice(0, 200)}

标题：`
            : `根据以下用户消息，生成一个简短的中文标题（5-15个字，不要使用引号）：

${userMessage}

标题：`

        try {
            // 直接使用 axios 发起请求
            const axios = (await import('axios')).default

            const response = await axios.post(
                `${modelConfig.baseURL}/chat/completions`,
                {
                    model: modelConfig.model,
                    messages: [
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 50,
                    temperature: 0.7,
                    enable_thinking: false,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${modelConfig.apiKey}`,
                    },
                }
            )

            // 清理标题（移除引号、换行等）
            const title = response.data.choices[0]?.message?.content
                ?.replace(/["""'']/g, '')
                ?.replace(/\n/g, '')
                ?.trim()
                ?.slice(0, 30) // 限制长度

            return title || '新对话'
        } catch (error) {
            console.error('Failed to generate title:', error)
            return '新对话'
        }
    }
}

// 单例
export const mcpLinkService = new MCPLinkService()

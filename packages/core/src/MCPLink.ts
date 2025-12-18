import type { LanguageModel } from 'ai'
import { MCPManager } from './MCPManager.js'
import { Agent } from './Agent.js'
import { PromptBasedAgent } from './PromptBasedAgent.js'
import type {
    MCPLinkConfig,
    MCPServerConfig,
    ChatCallbacks,
    ChatResult,
    MCPLinkEvent,
    MCPTool,
    MCPServerStatus,
} from './types.js'

/**
 * 支持原生 Reasoning（思考过程）的模型模式列表
 * 只有这些模型会使用 Agent.ts（原生模式）
 * 其他模型使用 PromptBasedAgent 来引导思考
 */
const NATIVE_REASONING_PATTERNS = [
    // Anthropic Claude - 支持原生 reasoning 事件
    /^claude-3/i,
    /^claude-2/i,
    // DeepSeek Reasoner - 支持 reasoning 事件，但需要 PromptBasedAgent 处理工具
    // 注意：deepseek-reasoner 虽然支持 reasoning，但不支持原生工具调用
    // OpenAI o1 系列 - 支持 reasoning
    /^o1/i,
    /^o3/i,
]

/**
 * 明确需要使用 Prompt-Based 方式的模型
 * 这些模型：1) 不支持原生 reasoning，或 2) 不支持原生工具调用
 */
const PROMPT_BASED_PATTERNS = [
    // DeepSeek 全系列（不支持原生 function calling，需要 prompt 引导工具）
    /deepseek/i,
    // OpenAI GPT 全系列（gpt-3.5, gpt-4, gpt-4o, gpt-5 等，都不支持原生 reasoning）
    /^gpt/i,
    // Google Gemini（支持工具调用，但不支持原生 reasoning）
    /^gemini/i,
    // Mistral（支持工具调用，但不支持原生 reasoning）
    /^mistral/i,
    // 开源模型
    /^llama/i,
    /^phi-/i,
    /^qwen/i,
    /^mixtral/i,
    /^command-r/i,
]

/**
 * 检测模型是否应该使用原生模式（Agent）还是 Prompt-Based 模式
 * @param modelId 模型 ID
 * @returns true = 使用原生 Agent, false = 使用 PromptBasedAgent
 */
function detectNativeToolSupport(modelId: string): boolean {
    // 先检查是否明确需要 Prompt-Based
    for (const pattern of PROMPT_BASED_PATTERNS) {
        if (pattern.test(modelId)) {
            console.log(`[MCPLink] Model "${modelId}" -> PromptBasedAgent (需要引导思考, matched: ${pattern})`)
            return false
        }
    }

    // 检查是否支持原生 reasoning
    for (const pattern of NATIVE_REASONING_PATTERNS) {
        if (pattern.test(modelId)) {
            console.log(`[MCPLink] Model "${modelId}" -> Agent (支持原生 reasoning, matched: ${pattern})`)
            return true
        }
    }

    // 默认使用 Prompt-Based（更安全，兼容所有模型，引导思考）
    console.log(`[MCPLink] Model "${modelId}" -> PromptBasedAgent (未知模型，默认使用引导模式)`)
    return false
}

/**
 * MCPLink 主类
 * AI Agent 工具调用框架的入口
 */
export class MCPLink {
    private model: LanguageModel
    private mcpManager: MCPManager
    private agent: Agent
    private promptBasedAgent: PromptBasedAgent
    private config: MCPLinkConfig
    private initialized = false
    private detectedNativeSupport: boolean

    constructor(config: MCPLinkConfig) {
        this.config = config
        this.model = config.model
        this.mcpManager = new MCPManager()

        // 添加配置的 MCP 服务器
        if (config.mcpServers) {
            for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
                this.mcpManager.addServer(id, serverConfig)
            }
        }

        // 创建 Agent
        this.agent = new Agent(this.model, this.mcpManager, {
            systemPrompt: config.systemPrompt,
            maxIterations: config.maxIterations,
        })

        // 创建 PromptBasedAgent
        this.promptBasedAgent = new PromptBasedAgent(this.model, this.mcpManager, {
            systemPrompt: config.systemPrompt,
            maxIterations: config.maxIterations,
        })

        // 自动检测模型是否支持原生工具调用
        // 如果用户强制指定了，则使用用户的设置
        if (config.usePromptBasedTools === true) {
            this.detectedNativeSupport = false
        } else if (config.usePromptBasedTools === false) {
            this.detectedNativeSupport = true
        } else {
            // 'auto' 或未指定：自动检测
            // 优先使用 modelName，其次使用 model.modelId
            const modelNameToCheck = config.modelName || config.model.modelId
            this.detectedNativeSupport = detectNativeToolSupport(modelNameToCheck)
        }
    }

    /**
     * 初始化 - 连接所有 MCP 服务器
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return
        }

        await this.mcpManager.startAll()
        this.initialized = true
    }

    /**
     * 关闭 - 断开所有 MCP 服务器连接
     */
    async close(): Promise<void> {
        await this.mcpManager.stopAll()
        this.initialized = false
    }

    /**
     * 发起对话
     */
    async chat(message: string, callbacks?: ChatCallbacks): Promise<ChatResult> {
        if (!this.initialized) {
            await this.initialize()
        }

        return this.agent.chat(message, callbacks)
    }

    /**
     * 流式对话
     * @param message 用户消息
     * @param options 可选参数
     * @param options.allowedTools 允许使用的工具名称列表
     * @param options.history 历史消息列表
     */
    async *chatStream(
        message: string,
        options?: {
            allowedTools?: string[]
            history?: Array<{ role: 'user' | 'assistant'; content: string }>
        }
    ): AsyncGenerator<MCPLinkEvent> {
        if (!this.initialized) {
            await this.initialize()
        }

        // 根据检测结果选择 Agent
        if (this.detectedNativeSupport) {
            yield* this.agent.chatStream(message, options)
        } else {
            yield* this.promptBasedAgent.chatStream(message, options)
        }
    }

    /**
     * 获取当前使用的模式
     */
    getToolCallingMode(): 'native' | 'prompt-based' {
        return this.detectedNativeSupport ? 'native' : 'prompt-based'
    }

    // ============ MCP 服务器管理 ============

    /**
     * 添加 MCP 服务器
     */
    addMCPServer(id: string, config: MCPServerConfig): void {
        this.mcpManager.addServer(id, config)
    }

    /**
     * 移除 MCP 服务器
     */
    async removeMCPServer(id: string): Promise<void> {
        await this.mcpManager.removeServer(id)
    }

    /**
     * 启动指定 MCP 服务器
     */
    async startMCPServer(id: string): Promise<void> {
        await this.mcpManager.startServer(id)
    }

    /**
     * 停止指定 MCP 服务器
     */
    async stopMCPServer(id: string): Promise<void> {
        await this.mcpManager.stopServer(id)
    }

    /**
     * 获取所有 MCP 服务器状态
     */
    getMCPServerStatuses(): MCPServerStatus[] {
        return this.mcpManager.getServerStatuses()
    }

    /**
     * 获取所有可用工具
     */
    getTools(): MCPTool[] {
        return this.mcpManager.getAllTools()
    }

    /**
     * 手动调用工具
     */
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
        return this.mcpManager.callTool(toolName, args)
    }

    // ============ 配置管理 ============

    /**
     * 更新系统提示词
     */
    setSystemPrompt(prompt: string): void {
        this.config.systemPrompt = prompt
        // 重新创建 Agent
        this.agent = new Agent(this.model, this.mcpManager, {
            systemPrompt: prompt,
            maxIterations: this.config.maxIterations,
        })
    }

    /**
     * 更新 AI 模型
     */
    setModel(model: LanguageModel): void {
        this.model = model
        this.config.model = model
        // 重新创建 Agent
        this.agent = new Agent(this.model, this.mcpManager, {
            systemPrompt: this.config.systemPrompt,
            maxIterations: this.config.maxIterations,
        })
    }
}

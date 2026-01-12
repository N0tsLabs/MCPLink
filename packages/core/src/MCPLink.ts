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
    UserMessage,
} from './types.js'

/**
 * 支持原生 Function Calling（工具调用）的模型模式列表
 * 这些模型使用 Agent.ts（原生工具调用模式）
 * 
 * 注意：某些"思考模型"（thinking models）虽然支持工具调用，
 * 但需要特殊的 API 处理（如 thought_signature），暂不支持
 */
const NATIVE_FUNCTION_CALLING_PATTERNS = [
    // OpenAI GPT 系列 - 支持原生 function calling
    /^gpt/i,
    // OpenAI o1/o3 需要特殊处理，暂用 PromptBased
    // /^o1/i,
    // /^o3/i,
    // Anthropic Claude - 支持原生 function calling
    /^claude/i,
    // Google Gemini 稳定版 - 支持原生 function calling
    // 注意：gemini-*-preview/thinking 版本需要特殊处理，不在此列表
    /^gemini-[\d.]+-flash$/i,
    /^gemini-[\d.]+-pro$/i,
    /^gemini-pro$/i,
    /^gemini-flash$/i,
    // Mistral - 支持原生 function calling
    /^mistral/i,
    /^mixtral/i,
    // Cohere Command-R - 支持原生 function calling
    /^command-r/i,
]

/**
 * 需要使用 Prompt-Based 方式的模型
 * 这些模型：
 * 1. 不支持原生 function calling
 * 2. 是"思考模型"，需要特殊 API 处理（如 thought_signature）
 */
const PROMPT_BASED_PATTERNS = [
    // DeepSeek（不支持原生 function calling）
    /deepseek/i,
    // OpenAI o1/o3 思考模型
    /^o1/i,
    /^o3/i,
    // Gemini 思考/预览版本 - 需要 thought_signature，暂用 PromptBased
    /gemini.*preview/i,
    /gemini.*thinking/i,
    /gemini.*exp/i,
    // 开源模型（大多数不支持原生 function calling）
    /^llama/i,
    /^phi-/i,
    /^qwen/i,
    /^yi-/i,
    /^glm/i,
    /^baichuan/i,
]

/**
 * 检测模型是否支持原生 Function Calling
 * @param modelId 模型 ID
 * @returns true = 使用原生 Agent, false = 使用 PromptBasedAgent
 */
function detectNativeToolSupport(modelId: string): boolean {
    console.log(`[MCPLink] 🔍 检测模型: "${modelId}"`)
    
    // 先检查是否明确需要 Prompt-Based（包括思考模型）
    for (const pattern of PROMPT_BASED_PATTERNS) {
        if (pattern.test(modelId)) {
            console.log(`[MCPLink] ✅ Model "${modelId}" -> PromptBasedAgent (matched: ${pattern})`)
            return false
        }
    }

    // 检查是否支持原生 function calling
    for (const pattern of NATIVE_FUNCTION_CALLING_PATTERNS) {
        if (pattern.test(modelId)) {
            console.log(`[MCPLink] ✅ Model "${modelId}" -> Agent (原生模式, matched: ${pattern})`)
            return true
        }
    }

    // 默认使用 Prompt-Based（更安全，兼容未知模型，提供思考过程）
    console.log(`[MCPLink] ⚠️ Model "${modelId}" -> PromptBasedAgent (未知模型，默认)`)
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
            immediateResultMatchers: config.immediateResultMatchers,
            parallelToolCalls: config.parallelToolCalls,
            enableThinkingPhase: config.enableThinkingPhase,
            thinkingPhasePrompt: config.thinkingPhasePrompt,
            thinkingMaxTokens: config.thinkingMaxTokens,
        })

        // 创建 PromptBasedAgent
        this.promptBasedAgent = new PromptBasedAgent(this.model, this.mcpManager, {
            systemPrompt: config.systemPrompt,
            maxIterations: config.maxIterations,
            immediateResultMatchers: config.immediateResultMatchers,
            parallelToolCalls: config.parallelToolCalls,
            enableThinkingPhase: config.enableThinkingPhase,
            thinkingPhasePrompt: config.thinkingPhasePrompt,
            thinkingMaxTokens: config.thinkingMaxTokens,
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
     * @param message 用户消息（支持字符串或多模态数组）
     * @param options 可选参数
     * @param options.allowedTools 允许使用的工具名称列表
     * @param options.history 历史消息列表
     */
    async *chatStream(
        message: UserMessage,
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
            immediateResultMatchers: this.config.immediateResultMatchers,
            parallelToolCalls: this.config.parallelToolCalls,
            enableThinkingPhase: this.config.enableThinkingPhase,
            thinkingPhasePrompt: this.config.thinkingPhasePrompt,
            thinkingMaxTokens: this.config.thinkingMaxTokens,
        })
        this.promptBasedAgent = new PromptBasedAgent(this.model, this.mcpManager, {
            systemPrompt: prompt,
            maxIterations: this.config.maxIterations,
            immediateResultMatchers: this.config.immediateResultMatchers,
            parallelToolCalls: this.config.parallelToolCalls,
            enableThinkingPhase: this.config.enableThinkingPhase,
            thinkingPhasePrompt: this.config.thinkingPhasePrompt,
            thinkingMaxTokens: this.config.thinkingMaxTokens,
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
            immediateResultMatchers: this.config.immediateResultMatchers,
            parallelToolCalls: this.config.parallelToolCalls,
            enableThinkingPhase: this.config.enableThinkingPhase,
            thinkingPhasePrompt: this.config.thinkingPhasePrompt,
            thinkingMaxTokens: this.config.thinkingMaxTokens,
        })
        this.promptBasedAgent = new PromptBasedAgent(this.model, this.mcpManager, {
            systemPrompt: this.config.systemPrompt,
            maxIterations: this.config.maxIterations,
            immediateResultMatchers: this.config.immediateResultMatchers,
            parallelToolCalls: this.config.parallelToolCalls,
            enableThinkingPhase: this.config.enableThinkingPhase,
            thinkingPhasePrompt: this.config.thinkingPhasePrompt,
            thinkingMaxTokens: this.config.thinkingMaxTokens,
        })
    }
}

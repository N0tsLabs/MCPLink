import type { FastifyInstance } from 'fastify'
import { configService } from '../services/ConfigService.js'
import { mcpLinkService } from '../services/MCPLinkService.js'
import type { SystemConfig } from '../types.js'

/**
 * 默认系统提示词
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业、友好的智能助手。

## 回复要求
- 简洁清晰，重点突出
- 用列表呈现关键信息
- 语气礼貌自然，像专业助手
- 有结论时直接给出，需要补充信息时简单询问`

/**
 * 配置管理路由
 */
export async function configRoutes(app: FastifyInstance) {
    /**
     * GET /api/config
     * 获取系统配置
     */
    app.get('/api/config', async () => {
        const settings = await configService.getSettings()
        return { settings }
    })

    /**
     * PUT /api/config
     * 更新系统配置
     */
    app.put('/api/config', async (request) => {
        const updates = request.body as Partial<SystemConfig>

        const current = await configService.getSettings()
        const newSettings = { ...current, ...updates }

        await configService.saveSettings(newSettings)

        // 触发重新初始化
        await mcpLinkService.reinitialize()

        return { success: true }
    })

    /**
     * GET /api/config/default-prompt
     * 获取默认系统提示词
     */
    app.get('/api/config/default-prompt', async () => {
        return { prompt: DEFAULT_SYSTEM_PROMPT }
    })

    /**
     * POST /api/config/validate
     * 验证配置
     */
    app.post('/api/config/validate', async (request) => {
        const config = request.body as SystemConfig

        // 简单的验证
        const errors: string[] = []

        if (config.maxIterations !== undefined) {
            if (config.maxIterations < 1 || config.maxIterations > 100) {
                errors.push('maxIterations must be between 1 and 100')
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        }
    })
}

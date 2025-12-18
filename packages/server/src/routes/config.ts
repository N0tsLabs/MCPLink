import type { FastifyInstance } from 'fastify'
import { DEFAULT_SYSTEM_PROMPT } from '@mcplink/core'
import { configService } from '../services/ConfigService.js'
import { mcpLinkService } from '../services/MCPLinkService.js'
import type { SystemConfig } from '../types.js'

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

        // 重新初始化 MCPLink
        await mcpLinkService.reinitialize().catch(console.error)

        return { settings: newSettings }
    })

    /**
     * GET /api/config/default-prompt
     * 获取默认系统提示词
     */
    app.get('/api/config/default-prompt', async () => {
        return { prompt: DEFAULT_SYSTEM_PROMPT }
    })

    /**
     * GET /api/health
     * 健康检查
     */
    app.get('/api/health', async () => {
        return {
            status: 'ok',
            timestamp: Date.now(),
            version: '0.0.1',
        }
    })
}

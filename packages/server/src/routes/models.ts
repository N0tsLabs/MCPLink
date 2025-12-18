import type { FastifyInstance } from 'fastify'
import { configService } from '../services/ConfigService.js'
import { mcpLinkService } from '../services/MCPLinkService.js'
import type { ModelConfig } from '../types.js'

/**
 * 模型管理路由
 */
export async function modelsRoutes(app: FastifyInstance) {
    /**
     * GET /api/models
     * 获取模型列表
     */
    app.get('/api/models', async () => {
        const models = await configService.getModels()
        return { models }
    })

    /**
     * GET /api/models/:id
     * 获取单个模型
     */
    app.get('/api/models/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const model = await configService.getModel(id)

        if (!model) {
            return reply.status(404).send({ error: 'Model not found' })
        }

        return { model }
    })

    /**
     * POST /api/models/fetch-remote
     * 从远程 API 获取可用模型列表
     */
    app.post('/api/models/fetch-remote', async (request, reply) => {
        const { baseURL, apiKey } = request.body as { baseURL: string; apiKey: string }

        if (!baseURL) {
            return reply.status(400).send({ error: 'baseURL is required' })
        }

        try {
            // 构造请求 URL
            let modelsUrl = baseURL.replace(/\/$/, '')
            if (!modelsUrl.endsWith('/models')) {
                modelsUrl += '/models'
            }

            // 发起请求
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                return reply.status(response.status).send({
                    error: `Failed to fetch models: ${response.statusText}`,
                    details: errorText,
                })
            }

            const data = (await response.json()) as any

            // OpenAI 格式: { data: [{ id: "gpt-4", ... }, ...] }
            // 或直接返回数组
            let models: string[] = []

            if (Array.isArray(data.data)) {
                models = data.data.map((m: any) => m.id || m.name).filter(Boolean)
            } else if (Array.isArray(data)) {
                models = data.map((m: any) => m.id || m.name || m).filter(Boolean)
            } else if (data.models && Array.isArray(data.models)) {
                models = data.models.map((m: any) => m.id || m.name || m).filter(Boolean)
            }

            return { models, success: true }
        } catch (error: any) {
            return reply.status(500).send({
                error: 'Failed to fetch models',
                details: error.message,
            })
        }
    })

    /**
     * POST /api/models
     * 添加模型
     */
    app.post('/api/models', async (request, reply) => {
        const body = request.body as Omit<ModelConfig, 'id'>

        if (!body.name || !body.model || !body.baseURL) {
            return reply.status(400).send({ error: 'name, model, baseURL are required' })
        }

        const model: ModelConfig = {
            id: crypto.randomUUID(),
            name: body.name,
            model: body.model,
            baseURL: body.baseURL,
            apiKey: body.apiKey || '',
            enabled: body.enabled ?? true,
        }

        await configService.addModel(model)

        return { model }
    })

    /**
     * POST /api/models/batch
     * 批量添加模型
     */
    app.post('/api/models/batch', async (request, reply) => {
        const { models, baseURL, apiKey } = request.body as {
            models: string[]
            baseURL: string
            apiKey: string
        }

        if (!models || !Array.isArray(models) || models.length === 0) {
            return reply.status(400).send({ error: 'models array is required' })
        }

        if (!baseURL) {
            return reply.status(400).send({ error: 'baseURL is required' })
        }

        const createdModels: ModelConfig[] = []

        for (const modelId of models) {
            const model: ModelConfig = {
                id: crypto.randomUUID(),
                name: modelId,
                model: modelId,
                baseURL: baseURL,
                apiKey: apiKey || '',
                enabled: true,
            }

            await configService.addModel(model)
            createdModels.push(model)
        }

        return {
            models: createdModels,
            count: createdModels.length,
        }
    })

    /**
     * PUT /api/models/:id
     * 更新模型
     */
    app.put('/api/models/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const updates = request.body as Partial<ModelConfig>

        const existing = await configService.getModel(id)
        if (!existing) {
            return reply.status(404).send({ error: 'Model not found' })
        }

        await configService.updateModel(id, updates)
        const updated = await configService.getModel(id)

        // 如果模型配置变更，重新初始化 MCPLink
        await mcpLinkService.reinitialize().catch(console.error)

        return { model: updated }
    })

    /**
     * DELETE /api/models/:id
     * 删除模型
     */
    app.delete('/api/models/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        const existing = await configService.getModel(id)
        if (!existing) {
            return reply.status(404).send({ error: 'Model not found' })
        }

        await configService.deleteModel(id)
        return { success: true }
    })

    /**
     * PUT /api/models/:id/toggle
     * 启用/停用模型
     */
    app.put('/api/models/:id/toggle', async (request, reply) => {
        const { id } = request.params as { id: string }

        const existing = await configService.getModel(id)
        if (!existing) {
            return reply.status(404).send({ error: 'Model not found' })
        }

        await configService.updateModel(id, { enabled: !existing.enabled })
        const updated = await configService.getModel(id)

        // 重新初始化 MCPLink
        await mcpLinkService.reinitialize().catch(console.error)

        return { model: updated }
    })
}

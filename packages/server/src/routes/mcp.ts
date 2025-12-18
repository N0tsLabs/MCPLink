import type { FastifyInstance } from 'fastify'
import { configService } from '../services/ConfigService.js'
import { mcpLinkService } from '../services/MCPLinkService.js'
import type { MCPServerConfigWithId } from '../types.js'

/**
 * MCP 工具管理路由
 */
export async function mcpRoutes(app: FastifyInstance) {
    /**
     * GET /api/mcp/servers
     * 获取 MCP 服务器列表
     */
    app.get('/api/mcp/servers', async () => {
        const servers = await configService.getMCPServers()

        // 尝试获取运行状态
        let statuses: Array<{ id: string; status: string; tools: unknown[]; error?: string }> = []
        try {
            statuses = await mcpLinkService.getMCPServerStatuses()
        } catch {
            // MCPLink 未初始化，忽略
        }

        // 合并配置和状态
        const serversWithStatus = servers.map((server) => {
            const status = statuses.find((s) => s.id === server.id)
            return {
                ...server,
                status: status?.status || 'stopped',
                tools: status?.tools || [],
                error: status?.error,
            }
        })

        return { servers: serversWithStatus }
    })

    /**
     * GET /api/mcp/servers/:id
     * 获取单个 MCP 服务器
     */
    app.get('/api/mcp/servers/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const server = await configService.getMCPServer(id)

        if (!server) {
            return reply.status(404).send({ error: 'MCP server not found' })
        }

        return { server }
    })

    /**
     * POST /api/mcp/servers
     * 添加 MCP 服务器
     */
    app.post('/api/mcp/servers', async (request, reply) => {
        const body = request.body as Omit<MCPServerConfigWithId, 'id'>

        if (!body.name || !body.type) {
            return reply.status(400).send({ error: 'name, type are required' })
        }

        if (body.type === 'stdio' && !body.command) {
            return reply.status(400).send({ error: 'command is required for stdio type' })
        }

        if (body.type === 'sse' && !body.url) {
            return reply.status(400).send({ error: 'url is required for sse type' })
        }

        const server: MCPServerConfigWithId = {
            id: crypto.randomUUID(),
            name: body.name,
            type: body.type,
            command: body.command,
            args: body.args,
            env: body.env,
            url: body.url,
            headers: body.headers,
            enabled: body.enabled ?? true,
            autoStart: body.autoStart ?? false,
        }

        await configService.addMCPServer(server)

        // 后台异步重新初始化 MCPLink（不阻塞响应）
        mcpLinkService.reinitialize().catch(console.error)

        return { server }
    })

    /**
     * PUT /api/mcp/servers/:id
     * 更新 MCP 服务器
     */
    app.put('/api/mcp/servers/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const updates = request.body as Partial<MCPServerConfigWithId>

        const existing = await configService.getMCPServer(id)
        if (!existing) {
            return reply.status(404).send({ error: 'MCP server not found' })
        }

        await configService.updateMCPServer(id, updates)
        const updated = await configService.getMCPServer(id)

        // 后台异步重新初始化 MCPLink（不阻塞响应）
        mcpLinkService.reinitialize().catch(console.error)

        return { server: updated }
    })

    /**
     * DELETE /api/mcp/servers/:id
     * 删除 MCP 服务器
     */
    app.delete('/api/mcp/servers/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        const existing = await configService.getMCPServer(id)
        if (!existing) {
            return reply.status(404).send({ error: 'MCP server not found' })
        }

        await configService.deleteMCPServer(id)

        // 后台异步重新初始化 MCPLink（不阻塞响应）
        mcpLinkService.reinitialize().catch(console.error)

        return { success: true }
    })

    /**
     * POST /api/mcp/servers/:id/start
     * 启动 MCP 服务器
     */
    app.post('/api/mcp/servers/:id/start', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            await mcpLinkService.startMCPServer(id)
            return { success: true }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return reply.status(500).send({ error: errorMessage })
        }
    })

    /**
     * POST /api/mcp/servers/:id/stop
     * 停止 MCP 服务器
     */
    app.post('/api/mcp/servers/:id/stop', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            await mcpLinkService.stopMCPServer(id)
            return { success: true }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return reply.status(500).send({ error: errorMessage })
        }
    })

    /**
     * GET /api/mcp/servers/:id/tools
     * 获取 MCP 服务器的工具列表
     */
    app.get('/api/mcp/servers/:id/tools', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const statuses = await mcpLinkService.getMCPServerStatuses()
            const server = statuses.find((s) => s.id === id)

            if (!server) {
                return reply.status(404).send({ error: 'MCP server not found or not running' })
            }

            return { tools: server.tools }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return reply.status(500).send({ error: errorMessage })
        }
    })

    /**
     * GET /api/mcp/tools
     * 获取所有可用工具
     */
    app.get('/api/mcp/tools', async (request, reply) => {
        try {
            const tools = await mcpLinkService.getTools()
            return { tools }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return reply.status(500).send({ error: errorMessage })
        }
    })
}

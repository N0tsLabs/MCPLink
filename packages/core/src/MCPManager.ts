import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { MCPServerConfig, MCPServerConfigStdio, MCPServerConfigSSE, MCPTool, MCPServerStatus } from './types.js'

/**
 * MCP 服务器实例
 */
interface MCPServerInstance {
    id: string
    config: MCPServerConfig
    client: Client
    transport: StdioClientTransport | SSEClientTransport
    tools: MCPTool[]
    status: 'stopped' | 'starting' | 'running' | 'error'
    error?: string
}

/**
 * MCP 管理器
 * 负责管理多个 MCP 服务器的连接、工具发现和调用
 */
export class MCPManager {
    private servers: Map<string, MCPServerInstance> = new Map()

    /**
     * 添加 MCP 服务器配置
     */
    addServer(id: string, config: MCPServerConfig): void {
        if (this.servers.has(id)) {
            throw new Error(`MCP server "${id}" already exists`)
        }

        // 创建 Client
        const client = new Client({ name: 'mcplink', version: '0.0.1' }, { capabilities: {} })

        // 创建 Transport
        let transport: StdioClientTransport | SSEClientTransport

        if (config.type === 'sse') {
            const sseConfig = config as MCPServerConfigSSE
            transport = new SSEClientTransport(new URL(sseConfig.url))
        } else {
            const stdioConfig = config as MCPServerConfigStdio
            // 合并当前进程的环境变量和配置的环境变量
            // 过滤掉 undefined 值
            const processEnv: Record<string, string> = {}
            for (const [key, value] of Object.entries(process.env)) {
                if (value !== undefined) {
                    processEnv[key] = value
                }
            }
            const mergedEnv = {
                ...processEnv,
                ...stdioConfig.env,
            }

            // Windows 兼容性处理
            // 在 Windows 上，npx/npm 等命令实际上是 .cmd 文件，需要通过 shell 执行
            const isWindows = process.platform === 'win32'
            let command = stdioConfig.command
            let args = stdioConfig.args || []

            if (isWindows) {
                // 对于 npx, npm, node 等命令，在 Windows 上需要通过 cmd /c 执行
                const windowsCommands = ['npx', 'npm', 'node', 'pnpm', 'yarn', 'bunx']
                if (windowsCommands.includes(command.toLowerCase())) {
                    args = ['/c', command, ...args]
                    command = 'cmd'
                }
            }

            transport = new StdioClientTransport({
                command,
                args,
                env: mergedEnv,
            })
        }

        this.servers.set(id, {
            id,
            config,
            client,
            transport,
            tools: [],
            status: 'stopped',
        })
    }

    /**
     * 启动 MCP 服务器
     */
    async startServer(id: string): Promise<void> {
        const server = this.servers.get(id)
        if (!server) {
            throw new Error(`MCP server "${id}" not found`)
        }

        if (server.status === 'running') {
            return
        }

        server.status = 'starting'
        server.error = undefined

        // 打印启动信息
        const config = server.config
        if (config.type === 'stdio') {
            const stdioConfig = config as MCPServerConfigStdio
            const isWindows = process.platform === 'win32'
            const windowsCommands = ['npx', 'npm', 'node', 'pnpm', 'yarn', 'bunx']
            let displayCmd = stdioConfig.command
            let displayArgs = stdioConfig.args || []

            if (isWindows && windowsCommands.includes(stdioConfig.command.toLowerCase())) {
                displayCmd = 'cmd'
                displayArgs = ['/c', stdioConfig.command, ...displayArgs]
            }

            console.log(`\n🔧 [MCP] 正在启动服务器 "${id}"...`)
            console.log(`   命令: ${displayCmd} ${displayArgs.join(' ')}`)
            if (stdioConfig.env && Object.keys(stdioConfig.env).length > 0) {
                console.log(`   环境变量: ${Object.keys(stdioConfig.env).join(', ')}`)
            }
        } else {
            const sseConfig = config as MCPServerConfigSSE
            console.log(`\n🔧 [MCP] 正在连接 SSE 服务器 "${id}"...`)
            console.log(`   URL: ${sseConfig.url}`)
        }

        try {
            // 连接到服务器
            await server.client.connect(server.transport)

            // 获取工具列表
            const toolsResult = await server.client.listTools()
            server.tools = toolsResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema as MCPTool['inputSchema'],
            }))

            server.status = 'running'
            console.log(`✅ [MCP] 服务器 "${id}" 启动成功，发现 ${server.tools.length} 个工具`)
            if (server.tools.length > 0) {
                console.log(`   工具: ${server.tools.map((t) => t.name).join(', ')}`)
            }
        } catch (error) {
            server.status = 'error'

            // 提供更详细的错误信息
            let errorMessage = error instanceof Error ? error.message : String(error)

            if (errorMessage.includes('Connection closed')) {
                if (config.type === 'stdio') {
                    const stdioConfig = config as MCPServerConfigStdio
                    errorMessage =
                        `MCP 服务器启动失败: 进程立即退出。\n` +
                        `命令: ${stdioConfig.command} ${(stdioConfig.args || []).join(' ')}\n` +
                        `可能原因:\n` +
                        `1. 命令 "${stdioConfig.command}" 不存在或不在 PATH 中\n` +
                        `2. 如果使用 Docker，请确保 Docker 正在运行\n` +
                        `3. 检查环境变量是否正确配置\n` +
                        `4. 尝试在终端手动运行命令查看具体错误`
                }
            }

            // 打印错误到控制台
            console.error(`❌ [MCP] 服务器 "${id}" 启动失败:`)
            console.error(`   ${errorMessage.split('\n').join('\n   ')}`)

            server.error = errorMessage
            throw new Error(errorMessage)
        }
    }

    /**
     * 停止 MCP 服务器
     */
    async stopServer(id: string): Promise<void> {
        const server = this.servers.get(id)
        if (!server) {
            throw new Error(`MCP server "${id}" not found`)
        }

        if (server.status === 'stopped') {
            return
        }

        console.log(`🔧 [MCP] 正在停止服务器 "${id}"...`)

        try {
            await server.client.close()
            console.log(`✅ [MCP] 服务器 "${id}" 已停止`)
        } catch (error) {
            console.error(`⚠️ [MCP] 停止服务器 "${id}" 时出错:`, error)
        } finally {
            server.status = 'stopped'
            server.tools = []
        }
    }

    /**
     * 启动所有已配置的服务器
     */
    async startAll(): Promise<void> {
        const startPromises = Array.from(this.servers.keys()).map((id) =>
            this.startServer(id).catch((error) => {
                console.error(`Failed to start MCP server "${id}":`, error)
            })
        )
        await Promise.all(startPromises)
    }

    /**
     * 停止所有服务器
     */
    async stopAll(): Promise<void> {
        const stopPromises = Array.from(this.servers.keys()).map((id) =>
            this.stopServer(id).catch((error) => {
                console.error(`Failed to stop MCP server "${id}":`, error)
            })
        )
        await Promise.all(stopPromises)
    }

    /**
     * 获取所有可用的工具
     */
    getAllTools(): MCPTool[] {
        const tools: MCPTool[] = []
        for (const server of this.servers.values()) {
            if (server.status === 'running') {
                tools.push(...server.tools)
            }
        }
        return tools
    }

    /**
     * 调用工具
     */
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
        // 找到提供该工具的服务器
        for (const server of this.servers.values()) {
            if (server.status !== 'running') continue

            const tool = server.tools.find((t) => t.name === toolName)
            if (tool) {
                const result = await server.client.callTool({
                    name: toolName,
                    arguments: args,
                })

                // 处理结果
                if (result.content && Array.isArray(result.content)) {
                    // 如果是文本内容，拼接返回
                    const textContents = result.content
                        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                        .map((c) => c.text)

                    if (textContents.length > 0) {
                        return textContents.join('\n')
                    }
                }

                return result.content
            }
        }

        throw new Error(`Tool "${toolName}" not found in any running MCP server`)
    }

    /**
     * 获取所有服务器状态
     */
    getServerStatuses(): MCPServerStatus[] {
        return Array.from(this.servers.values()).map((server) => ({
            id: server.id,
            name: server.id,
            config: server.config,
            status: server.status,
            tools: server.tools,
            error: server.error,
        }))
    }

    /**
     * 移除服务器
     */
    async removeServer(id: string): Promise<void> {
        await this.stopServer(id)
        this.servers.delete(id)
    }
}

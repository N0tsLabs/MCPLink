import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'
import { modelsRoutes } from './routes/models.js'
import { mcpRoutes } from './routes/mcp.js'
import { configRoutes } from './routes/config.js'
import { configService } from './services/ConfigService.js'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

async function main() {
    // 确保配置目录存在
    await configService.ensureConfigDir()

    // 创建 Fastify 实例
    const app = Fastify({
        logger: true,
        bodyLimit: 50 * 1024 * 1024, // 50MB，支持上传大图片
    })

    // 注册 CORS
    await app.register(cors, {
        origin: true, // 允许所有来源
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })

    // 注册路由
    await app.register(chatRoutes)
    await app.register(modelsRoutes)
    await app.register(mcpRoutes)
    await app.register(configRoutes)

    // 根路由
    app.get('/', async () => {
        return {
            name: 'MCPLink Server',
            version: '0.0.1',
            description: 'AI Agent 工具调用框架后端服务',
            endpoints: {
                health: 'GET /api/health',
                chat: 'POST /api/chat',
                models: 'GET /api/models',
                mcpServers: 'GET /api/mcp/servers',
                config: 'GET /api/config',
            },
        }
    })

    // 健康检查端点
    app.get('/api/health', async () => {
        return {
            status: 'ok',
            timestamp: Date.now(),
            version: '0.0.1',
        }
    })

    // 启动服务器
    try {
        await app.listen({ port: PORT, host: HOST })
        console.log(`\n🚀 MCPLink Server is running at http://${HOST}:${PORT}`)
        console.log(`\n📚 API Endpoints:`)
        console.log(`   - Health: GET http://localhost:${PORT}/api/health`)
        console.log(`   - Chat:   POST http://localhost:${PORT}/api/chat`)
        console.log(`   - Models: GET http://localhost:${PORT}/api/models`)
        console.log(`   - MCP:    GET http://localhost:${PORT}/api/mcp/servers`)
        console.log(`   - Config: GET http://localhost:${PORT}/api/config`)
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

main()

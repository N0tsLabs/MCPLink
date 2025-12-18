/**
 * 简单测试 - 只测试模型的思考和回复能力
 * 不依赖 MCP 服务器
 *
 * 使用方式：
 * 1. 复制 env.template 为 .env 并填入配置
 * 2. 运行: npx tsx packages/core/test/simple-test.ts
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createOpenAI } from '@ai-sdk/openai'
import { MCPLink } from '../src/MCPLink.js'
import { MCPLinkEventType } from '../src/types.js'

// 获取项目根目录并加载 .env 文件
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

// ============ 从环境变量读取配置 ============
const CONFIG = {
    baseURL: process.env.API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.DEFAULT_MODEL || 'gpt-4o',
    question: process.env.TEST_QUESTION || '介绍一下你自己',
}

// 检查必要配置
if (!CONFIG.apiKey || CONFIG.apiKey === 'sk-your-api-key-here') {
    console.error('❌ 请先配置 API_KEY')
    console.error('   1. 复制 env.template 为 .env')
    console.error('   2. 在 .env 中填入你的 API_KEY')
    process.exit(1)
}

// ============ 测试代码 ============

async function runTest() {
    console.log('🧪 简单测试 - 思考和回复能力')
    console.log('='.repeat(50))
    console.log(`模型: ${CONFIG.model}`)
    console.log(`问题: ${CONFIG.question}`)
    console.log('='.repeat(50))

    const provider = createOpenAI({
        baseURL: CONFIG.baseURL,
        apiKey: CONFIG.apiKey,
    })
    const model = provider(CONFIG.model)

    const mcpLink = new MCPLink({
        model,
        modelName: CONFIG.model,
        maxIterations: 3,
    })

    await mcpLink.initialize()
    console.log(`\n检测模式: ${mcpLink.getToolCallingMode()}\n`)

    let thinkingText = ''
    let responseText = ''

    for await (const event of mcpLink.chatStream(CONFIG.question)) {
        switch (event.type) {
            case MCPLinkEventType.THINKING_START:
                process.stdout.write('💭 思考中: ')
                break
            case MCPLinkEventType.THINKING_DELTA:
                thinkingText += event.data.content || ''
                process.stdout.write(event.data.content || '')
                break
            case MCPLinkEventType.THINKING_END:
                console.log('\n')
                break
            case MCPLinkEventType.TEXT_START:
                process.stdout.write('💬 回复: ')
                break
            case MCPLinkEventType.TEXT_DELTA:
                responseText += event.data.content || ''
                process.stdout.write(event.data.content || '')
                break
            case MCPLinkEventType.TEXT_END:
                console.log('\n')
                break
            case MCPLinkEventType.COMPLETE:
                console.log(`✅ 完成 (${event.data.totalDuration}ms)`)
                break
            case MCPLinkEventType.ERROR:
                console.error(`❌ 错误: ${event.data.error}`)
                break
        }
    }

    console.log('\n' + '='.repeat(50))
    console.log('结果检查:')
    console.log(`- 思考内容: ${thinkingText.length > 0 ? '✅ 有' : '❌ 无'} (${thinkingText.length}字)`)
    console.log(`- 回复内容: ${responseText.length > 0 ? '✅ 有' : '❌ 无'} (${responseText.length}字)`)

    const hasTagLeak = responseText.includes('<think>') || responseText.includes('<tool_call>')
    console.log(`- 标签泄漏: ${hasTagLeak ? '❌ 有泄漏!' : '✅ 无'}`)

    await mcpLink.close()
}

runTest().catch(console.error)

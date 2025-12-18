/**
 * 直接 Core 测试 - 绕过后端，直接使用最新编译的 core 包
 * 这个测试确保使用的是最新的 PromptBasedAgent 代码
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

import { createOpenAI } from '@ai-sdk/openai'
import { MCPLink, MCPLinkEventType } from '../dist/index.js'

const CONFIG = {
    apiBaseUrl: process.env.API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.TEST_MODEL || 'gpt-4o-mini',
}

async function directCoreTest() {
    console.log('='.repeat(70))
    console.log('🧪 直接 Core 测试 - 使用最新编译的 core 包')
    console.log('='.repeat(70))
    console.log(`模型: ${CONFIG.model}`)
    console.log(`API: ${CONFIG.apiBaseUrl}`)
    console.log('='.repeat(70))

    if (!CONFIG.apiKey) {
        console.log('❌ 请先配置 API_KEY')
        return
    }

    const openai = createOpenAI({
        baseURL: CONFIG.apiBaseUrl,
        apiKey: CONFIG.apiKey,
    })

    // 创建 MCPLink 实例
    const mcpLink = new MCPLink({
        model: openai(CONFIG.model),
        modelName: CONFIG.model,
        mcpServers: {
            'fetch': {
                type: 'stdio',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-fetch'],
            },
        },
        maxIterations: 5,
    })

    console.log(`\n工具调用模式: ${mcpLink.getToolCallingMode()}`)
    console.log('正在初始化 MCP 服务器...')

    try {
        await mcpLink.initialize()
        console.log('✅ MCP 服务器初始化成功')
    } catch (error) {
        console.error('⚠️ MCP 服务器初始化失败:', error)
        console.log('继续测试（不使用工具）...')
    }

    const tools = mcpLink.getTools()
    console.log(`可用工具: ${tools.map(t => t.name).join(', ') || '无'}`)

    const message = '总结一下 wkea.cn'
    console.log(`\n发送消息: "${message}"`)
    console.log('-'.repeat(70))

    // 统计
    const events: { type: string; data: any }[] = []
    let thinkingContent = ''
    let textContent = ''
    let toolCalls: string[] = []

    try {
        for await (const event of mcpLink.chatStream(message)) {
            events.push({ type: event.type, data: event.data })

            switch (event.type) {
                case MCPLinkEventType.ITERATION_START:
                    console.log(`\n📍 [iteration_start] 迭代 ${event.data.iteration}/${event.data.maxIterations}`)
                    break
                case MCPLinkEventType.ITERATION_END:
                    console.log(`\n📍 [iteration_end] 迭代 ${event.data.iteration}`)
                    break
                case MCPLinkEventType.THINKING_START:
                    console.log('\n💭 [thinking_start]')
                    break
                case MCPLinkEventType.THINKING_DELTA:
                    thinkingContent += event.data.content || ''
                    process.stdout.write(event.data.content || '')
                    break
                case MCPLinkEventType.THINKING_END:
                    console.log('\n💭 [thinking_end]')
                    break
                case MCPLinkEventType.TEXT_START:
                    console.log('\n📝 [text_start]')
                    break
                case MCPLinkEventType.TEXT_DELTA:
                    textContent += event.data.content || ''
                    process.stdout.write(event.data.content || '')
                    break
                case MCPLinkEventType.TEXT_END:
                    console.log('\n📝 [text_end]')
                    break
                case MCPLinkEventType.TOOL_CALL_START:
                    toolCalls.push(event.data.toolName)
                    console.log(`\n🔧 [tool_call_start] ${event.data.toolName}`)
                    console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
                    break
                case MCPLinkEventType.TOOL_EXECUTING:
                    console.log(`   ⏳ [tool_executing]`)
                    break
                case MCPLinkEventType.TOOL_RESULT:
                    const preview = String(event.data.toolResult || '').substring(0, 100)
                    console.log(`   ✅ [tool_result] ${event.data.duration}ms`)
                    console.log(`   预览: ${preview}...`)
                    break
                case MCPLinkEventType.COMPLETE:
                    console.log(`\n✅ [complete] 总耗时: ${event.data.totalDuration}ms, 迭代: ${event.data.totalIterations}`)
                    break
            }
        }
    } catch (error) {
        console.error('\n❌ 错误:', error)
    }

    await mcpLink.close()

    // 输出统计
    console.log('\n' + '='.repeat(70))
    console.log('📊 事件统计')
    console.log('='.repeat(70))

    const eventCounts: Record<string, number> = {}
    for (const event of events) {
        eventCounts[event.type] = (eventCounts[event.type] || 0) + 1
    }
    console.log('事件计数:', eventCounts)

    // 验证结果
    console.log('\n' + '-'.repeat(70))
    console.log('🔍 验证结果')
    console.log('-'.repeat(70))

    const hasThinking = thinkingContent.length > 0
    const hasToolCall = toolCalls.length > 0
    const hasResponse = textContent.length > 0
    const hasSecondIteration = (eventCounts[MCPLinkEventType.ITERATION_START] || 0) >= 2

    console.log(`思考过程: ${hasThinking ? '✅' : '❌'} (${thinkingContent.length} 字符)`)
    console.log(`工具调用: ${hasToolCall ? '✅' : '❌'} (${toolCalls.join(', ') || '无'})`)
    console.log(`最终回复: ${hasResponse ? '✅' : '❌'} (${textContent.length} 字符)`)
    console.log(`第二次迭代: ${hasSecondIteration ? '✅' : '❌'}`)

    if (thinkingContent) {
        console.log('\n💭 思考内容:')
        console.log(thinkingContent)
    }

    if (textContent) {
        console.log('\n📝 回复内容:')
        console.log(textContent)
    }

    const allPassed = hasThinking && hasToolCall && hasResponse
    console.log('\n' + '='.repeat(70))
    console.log(allPassed ? '🎉 测试通过!' : '⚠️  测试未通过')
    console.log('='.repeat(70))
}

directCoreTest().catch(console.error)


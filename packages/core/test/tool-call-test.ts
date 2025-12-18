/**
 * 工具调用完整测试
 * 测试思考 + 工具调用 + 回复的完整流程
 *
 * 使用方式：
 * 1. 复制 env.template 为 .env 并填入配置
 * 2. 运行: npx tsx packages/core/test/tool-call-test.ts
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createOpenAI } from '@ai-sdk/openai'
import { MCPLink } from '../src/MCPLink.js'
import { MCPLinkEventType, type MCPLinkEvent } from '../src/types.js'

// 获取项目根目录并加载 .env 文件
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

// ============ 从环境变量读取配置 ============
const CONFIG = {
    baseURL: process.env.API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.DEFAULT_MODEL || 'gpt-4o',
    // 需要工具调用的问题（强制使用工具）
    question: 'wkea.cn 这个网站是做什么的？请使用 fetch 工具获取网页内容后用中文总结',
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
    console.log('='.repeat(70))
    console.log('🔧 工具调用完整测试 - 思考 + 工具 + 回复')
    console.log('='.repeat(70))
    console.log(`模型: ${CONFIG.model}`)
    console.log(`问题: ${CONFIG.question}`)
    console.log('='.repeat(70))
    console.log()

    // 创建模型
    const provider = createOpenAI({
        baseURL: CONFIG.baseURL,
        apiKey: CONFIG.apiKey,
    })
    const model = provider(CONFIG.model)

    // 创建 MCPLink 实例，配置 fetch MCP 服务器
    const mcpLink = new MCPLink({
        model,
        modelName: CONFIG.model,
        systemPrompt: `你是一个智能助手，可以通过调用工具来帮助用户完成任务。

## 重要规则
1. 所有回复必须使用中文
2. 当用户询问网站内容时，请使用 fetch 工具获取网页内容
3. 获取内容后，用中文总结网页的主要信息`,
        maxIterations: 5,
        mcpServers: {
            fetch: {
                command: 'npx',
                args: ['-y', '@anthropic-ai/mcp-server-fetch'],
            },
        },
    })

    console.log('正在初始化 MCP 服务器...')
    await mcpLink.initialize()

    const tools = mcpLink.getTools()
    console.log(`\n可用工具 (${tools.length} 个):`)
    tools.forEach((t) => console.log(`  - ${t.name}: ${t.description?.substring(0, 50)}...`))

    console.log(`\n检测到的模式: ${mcpLink.getToolCallingMode()}`)
    console.log('\n' + '-'.repeat(70))
    console.log('开始对话...')
    console.log('-'.repeat(70))

    // 统计
    const stats = {
        thinkingContent: '',
        textContent: '',
        toolCalls: [] as Array<{ name: string; args: unknown; result: unknown; duration: number }>,
        events: [] as MCPLinkEvent[],
        iterations: 0,
    }

    try {
        for await (const event of mcpLink.chatStream(CONFIG.question)) {
            stats.events.push(event)

            switch (event.type) {
                case MCPLinkEventType.ITERATION_START:
                    stats.iterations = event.data.iteration || 0
                    console.log(`\n📍 迭代 ${event.data.iteration}/${event.data.maxIterations}`)
                    break

                case MCPLinkEventType.THINKING_START:
                    process.stdout.write('\n💭 思考中: ')
                    break

                case MCPLinkEventType.THINKING_DELTA:
                    if (event.data.content) {
                        stats.thinkingContent += event.data.content
                        process.stdout.write(event.data.content)
                    }
                    break

                case MCPLinkEventType.THINKING_END:
                    console.log('\n💭 思考结束')
                    break

                case MCPLinkEventType.TEXT_START:
                    process.stdout.write('\n💬 回复: ')
                    break

                case MCPLinkEventType.TEXT_DELTA:
                    if (event.data.content) {
                        stats.textContent += event.data.content
                        process.stdout.write(event.data.content)
                    }
                    break

                case MCPLinkEventType.TEXT_END:
                    console.log('\n')
                    break

                case MCPLinkEventType.TOOL_CALL_START:
                    console.log(`\n🔧 工具调用: ${event.data.toolName}`)
                    console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
                    break

                case MCPLinkEventType.TOOL_EXECUTING:
                    console.log(`   ⏳ 执行中...`)
                    break

                case MCPLinkEventType.TOOL_RESULT:
                    const resultPreview =
                        typeof event.data.toolResult === 'string'
                            ? event.data.toolResult.substring(0, 200)
                            : JSON.stringify(event.data.toolResult).substring(0, 200)
                    console.log(`   ✅ 完成 (${event.data.duration}ms)`)
                    console.log(`   结果预览: ${resultPreview}...`)
                    stats.toolCalls.push({
                        name: event.data.toolName || '',
                        args: event.data.toolArgs,
                        result: event.data.toolResult,
                        duration: event.data.duration || 0,
                    })
                    break

                case MCPLinkEventType.ITERATION_END:
                    console.log(`📍 迭代 ${event.data.iteration} 结束`)
                    break

                case MCPLinkEventType.COMPLETE:
                    console.log(`\n✅ 完成! 总耗时: ${event.data.totalDuration}ms, 迭代: ${event.data.totalIterations}`)
                    break

                case MCPLinkEventType.ERROR:
                    console.error(`\n❌ 错误: ${event.data.error}`)
                    break
            }
        }
    } catch (error) {
        console.error('\n❌ 执行出错:', error)
    }

    // 输出统计
    console.log('\n' + '='.repeat(70))
    console.log('📊 测试结果统计')
    console.log('='.repeat(70))
    console.log(`事件总数: ${stats.events.length}`)
    console.log(`迭代次数: ${stats.iterations}`)
    console.log(`思考内容: ${stats.thinkingContent.length} 字符`)
    console.log(`回复内容: ${stats.textContent.length} 字符`)
    console.log(`工具调用: ${stats.toolCalls.length} 次`)

    if (stats.toolCalls.length > 0) {
        console.log('\n工具调用详情:')
        stats.toolCalls.forEach((tc, i) => {
            console.log(`  ${i + 1}. ${tc.name} (${tc.duration}ms)`)
        })
    }

    const eventTypes = [...new Set(stats.events.map((e) => e.type))]
    console.log(`\n事件类型: ${eventTypes.join(', ')}`)

    // 验证结果
    console.log('\n' + '-'.repeat(70))
    console.log('🔍 验证结果')
    console.log('-'.repeat(70))

    const hasThinking = stats.thinkingContent.length > 0
    const hasToolCall = stats.toolCalls.length > 0
    const hasResponse = stats.textContent.length > 0
    const hasTagLeak =
        stats.textContent.includes('<think>') ||
        stats.textContent.includes('<tool_call>') ||
        stats.textContent.includes('```json') ||
        stats.textContent.match(/\{\s*"name"\s*:/)

    console.log(`思考过程: ${hasThinking ? '✅ 有' : '❌ 无'} (${stats.thinkingContent.length}字)`)
    console.log(`工具调用: ${hasToolCall ? '✅ 有' : '❌ 无'} (${stats.toolCalls.length}次)`)
    console.log(`最终回复: ${hasResponse ? '✅ 有' : '❌ 无'} (${stats.textContent.length}字)`)
    console.log(`标签泄漏: ${hasTagLeak ? '❌ 有泄漏!' : '✅ 无'}`)

    const allPassed = hasThinking && hasToolCall && hasResponse && !hasTagLeak
    console.log('\n' + '='.repeat(70))
    console.log(allPassed ? '🎉 全部测试通过!' : '⚠️ 部分测试未通过')
    console.log('='.repeat(70))

    if (hasTagLeak) {
        console.log('\n⚠️ 回复内容中发现泄漏的标签/JSON:')
        console.log(stats.textContent)
    }

    await mcpLink.close()
}

// 运行测试
runTest().catch(console.error)


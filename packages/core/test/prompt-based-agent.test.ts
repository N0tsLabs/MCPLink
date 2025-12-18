/**
 * PromptBasedAgent 测试用例
 *
 * 使用方式：
 * 1. 复制 env.template 为 .env 并填入配置
 * 2. 运行: npx tsx packages/core/test/prompt-based-agent.test.ts
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
    question: process.env.TEST_QUESTION || '你好，介绍一下你自己',
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
    console.log('='.repeat(60))
    console.log('PromptBasedAgent 测试')
    console.log('='.repeat(60))
    console.log(`模型: ${CONFIG.model}`)
    console.log(`问题: ${CONFIG.question}`)
    console.log('='.repeat(60))
    console.log()

    // 创建模型
    const provider = createOpenAI({
        baseURL: CONFIG.baseURL,
        apiKey: CONFIG.apiKey,
    })
    const model = provider(CONFIG.model)

    // 创建 MCPLink 实例（带一个简单的 fetch 工具模拟）
    const mcpLink = new MCPLink({
        model,
        modelName: CONFIG.model,
        systemPrompt: '你是一个智能助手，可以通过调用工具来帮助用户完成任务。所有回复必须使用中文。',
        maxIterations: 5,
    })

    // 初始化
    await mcpLink.initialize()

    console.log(`检测到的模式: ${mcpLink.getToolCallingMode()}`)
    console.log()

    // 运行对话
    const events: MCPLinkEvent[] = []
    let thinkingContent = ''
    let textContent = ''
    let isThinking = false

    try {
        for await (const event of mcpLink.chatStream(CONFIG.question)) {
            events.push(event)

            switch (event.type) {
                case MCPLinkEventType.ITERATION_START:
                    console.log(`\n--- 迭代 ${event.data.iteration}/${event.data.maxIterations} ---`)
                    break

                case MCPLinkEventType.THINKING_START:
                    isThinking = true
                    process.stdout.write('\n[思考开始] ')
                    break

                case MCPLinkEventType.THINKING_DELTA:
                    if (event.data.content) {
                        thinkingContent += event.data.content
                        process.stdout.write(event.data.content)
                    }
                    break

                case MCPLinkEventType.THINKING_END:
                    isThinking = false
                    console.log('\n[思考结束]')
                    break

                case MCPLinkEventType.TEXT_START:
                    process.stdout.write('\n[回复开始] ')
                    break

                case MCPLinkEventType.TEXT_DELTA:
                    if (event.data.content) {
                        textContent += event.data.content
                        process.stdout.write(event.data.content)
                    }
                    break

                case MCPLinkEventType.TEXT_END:
                    console.log('\n[回复结束]')
                    break

                case MCPLinkEventType.TOOL_CALL_START:
                    console.log(`\n[工具调用] ${event.data.toolName}`)
                    console.log(`参数: ${JSON.stringify(event.data.toolArgs, null, 2)}`)
                    break

                case MCPLinkEventType.TOOL_EXECUTING:
                    console.log(`[执行中...] ${event.data.toolName}`)
                    break

                case MCPLinkEventType.TOOL_RESULT:
                    console.log(`[工具结果] ${event.data.toolName} (${event.data.duration}ms)`)
                    const resultStr =
                        typeof event.data.toolResult === 'string'
                            ? event.data.toolResult.substring(0, 200) + '...'
                            : JSON.stringify(event.data.toolResult).substring(0, 200) + '...'
                    console.log(`结果预览: ${resultStr}`)
                    break

                case MCPLinkEventType.ITERATION_END:
                    console.log(`--- 迭代 ${event.data.iteration} 结束 ---`)
                    break

                case MCPLinkEventType.COMPLETE:
                    console.log(
                        `\n✅ 完成! 总耗时: ${event.data.totalDuration}ms, 迭代次数: ${event.data.totalIterations}`
                    )
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
    console.log('\n' + '='.repeat(60))
    console.log('测试结果统计')
    console.log('='.repeat(60))
    console.log(`事件总数: ${events.length}`)
    console.log(`思考内容长度: ${thinkingContent.length} 字符`)
    console.log(`回复内容长度: ${textContent.length} 字符`)

    const eventTypes = events.map((e) => e.type)
    console.log(`事件类型: ${[...new Set(eventTypes)].join(', ')}`)

    // 检查是否有异常
    const hasThinkingStart = eventTypes.includes(MCPLinkEventType.THINKING_START)
    const hasThinkingEnd = eventTypes.includes(MCPLinkEventType.THINKING_END)
    const hasTextContent = textContent.length > 0

    console.log('\n验证结果:')
    console.log(`- 思考过程开始: ${hasThinkingStart ? '✅' : '❌'}`)
    console.log(`- 思考过程结束: ${hasThinkingEnd ? '✅' : '❌'}`)
    console.log(`- 有回复内容: ${hasTextContent ? '✅' : '❌'}`)

    // 检查是否有 <think> 或 <tool_call> 标签泄漏到文本中
    const hasLeakedTags =
        textContent.includes('<think>') ||
        textContent.includes('</think>') ||
        textContent.includes('<tool_call>') ||
        textContent.includes('</tool_call>')
    console.log(`- 标签未泄漏: ${!hasLeakedTags ? '✅' : '❌ (文本中发现标签!)'}`)

    if (hasLeakedTags) {
        console.log('\n⚠️ 警告: 发现标签泄漏到文本内容中!')
        console.log('泄漏的文本内容:')
        console.log(textContent)
    }

    await mcpLink.close()
}

// 运行测试
runTest().catch(console.error)

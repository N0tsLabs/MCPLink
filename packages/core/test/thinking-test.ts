/**
 * 思考过程测试
 * 测试所有模型（包括 GPT）是否正确输出思考过程
 */
import { config } from 'dotenv'
config({ path: '../../.env' })

import { MCPLink, MCPLinkEventType } from '../src/index.js'
import { createOpenAI } from '@ai-sdk/openai'

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.openai.com/v1'
const API_KEY = process.env.API_KEY
// 强制测试 GPT 模型，即使 .env 设置了其他模型
const MODEL = process.env.TEST_MODEL || 'gpt-4o-mini'

if (!API_KEY) {
    console.error('❌ 请先配置 API_KEY')
    process.exit(1)
}

async function testThinkingProcess() {
    console.log('============================================================')
    console.log('思考过程测试')
    console.log('============================================================')
    console.log(`模型: ${MODEL}`)
    console.log(`问题: 总结一下 wkea.cn（需要工具调用）`)
    console.log('============================================================\n')

    const openai = createOpenAI({
        baseURL: API_BASE_URL,
        apiKey: API_KEY,
    })

    // 不使用工具，专注测试思考过程
    const mcpLink = new MCPLink({
        model: openai(MODEL),
        modelName: MODEL,
        mcpServers: {},
    })

    console.log('正在初始化...')
    await mcpLink.initialize()
    console.log('初始化完成\n')

    // 统计
    let hasThinkingStart = false
    let hasThinkingDelta = false
    let hasThinkingEnd = false
    let thinkingContent = ''
    let hasToolCall = false
    let hasTextOutput = false

    console.log('--- 开始对话 ---\n')

    for await (const event of mcpLink.chatStream('你好，介绍一下你自己')) {
        switch (event.type) {
            case MCPLinkEventType.THINKING_START:
                hasThinkingStart = true
                console.log('💭 [思考开始]')
                break

            case MCPLinkEventType.THINKING_DELTA:
                hasThinkingDelta = true
                thinkingContent += event.data.content || ''
                process.stdout.write(event.data.content || '')
                break

            case MCPLinkEventType.THINKING_END:
                hasThinkingEnd = true
                console.log('\n💭 [思考结束]\n')
                break

            case MCPLinkEventType.TOOL_CALL_START:
                hasToolCall = true
                console.log(`🔧 [工具调用] ${event.data.toolName}`)
                break

            case MCPLinkEventType.TEXT_DELTA:
                hasTextOutput = true
                process.stdout.write(event.data.content || '')
                break

            case MCPLinkEventType.ITERATION_START:
                console.log(`\n--- 迭代 ${event.data.iteration} ---`)
                break
        }
    }

    console.log('\n\n============================================================')
    console.log('测试结果')
    console.log('============================================================')
    console.log(`思考开始事件: ${hasThinkingStart ? '✅' : '❌'}`)
    console.log(`思考内容事件: ${hasThinkingDelta ? '✅' : '❌'}`)
    console.log(`思考结束事件: ${hasThinkingEnd ? '✅' : '❌'}`)
    console.log(`思考内容长度: ${thinkingContent.length} 字符`)
    console.log(`有文本输出: ${hasTextOutput ? '✅' : '❌'}`)
    
    const hasFullThinking = hasThinkingStart && hasThinkingDelta && hasThinkingEnd
    console.log(`\n思考过程完整: ${hasFullThinking ? '✅ 通过' : '❌ 失败'}`)
    
    if (!hasFullThinking) {
        console.log('\n⚠️ 问题分析:')
        if (!hasThinkingStart) console.log('  - 没有收到 THINKING_START 事件')
        if (!hasThinkingDelta) console.log('  - 没有收到 THINKING_DELTA 事件')
        if (!hasThinkingEnd) console.log('  - 没有收到 THINKING_END 事件')
        if (thinkingContent.length === 0) console.log('  - 思考内容为空')
    }

    return hasFullThinking
}

testThinkingProcess()
    .then((passed) => {
        process.exit(passed ? 0 : 1)
    })
    .catch((err) => {
        console.error('测试出错:', err)
        process.exit(1)
    })


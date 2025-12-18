/**
 * 工具调用后继续测试
 * 测试工具调用完成后，AI 是否能正确进行第二次迭代并总结
 */
import { config } from 'dotenv'
config({ path: '../../.env' })

import { createOpenAI } from '@ai-sdk/openai'
import { MCPLink, MCPLinkEventType } from '../src/index.js'

const CONFIG = {
    apiBaseUrl: process.env.API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.TEST_MODEL || 'gpt-4o-mini',
}

// 模拟 MCP 工具（直接返回测试数据，不需要真实的 MCP 服务器）
class MockMCPManager {
    getAllTools() {
        return [
            {
                name: 'get_website_info',
                description: '获取网站信息',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: '网站 URL' }
                    },
                    required: ['url']
                }
            }
        ]
    }

    async callTool(name: string, args: Record<string, unknown>) {
        console.log(`\n🔧 [Mock] 工具被调用: ${name}`)
        console.log(`   参数: ${JSON.stringify(args)}`)
        
        // 模拟网站内容
        const result = {
            title: 'WKEA 测试网站',
            content: '这是一个工业品电商平台，主营五金工具、机械配件等产品。提供正品低价、快速配送服务。'
        }
        
        console.log(`   返回: ${JSON.stringify(result)}`)
        return result
    }
}

async function testToolContinue() {
    console.log('=' .repeat(70))
    console.log('🧪 工具调用后继续测试')
    console.log('=' .repeat(70))
    console.log(`模型: ${CONFIG.model}`)
    console.log('=' .repeat(70))

    if (!CONFIG.apiKey) {
        console.log('❌ 请先配置 API_KEY')
        return
    }

    const openai = createOpenAI({
        baseURL: CONFIG.apiBaseUrl,
        apiKey: CONFIG.apiKey,
    })

    // 直接使用 PromptBasedAgent 测试
    const { PromptBasedAgent } = await import('../src/PromptBasedAgent.js')
    
    const mockMCPManager = new MockMCPManager()
    const agent = new PromptBasedAgent(
        openai(CONFIG.model),
        mockMCPManager as any,
        { maxIterations: 3 }
    )

    const question = '请获取 wkea.cn 的网站信息并用中文总结'
    console.log(`\n问题: ${question}`)
    console.log('-'.repeat(70))

    let iteration = 0
    let toolCalls = 0
    let textContent = ''
    let thinkingContent = ''
    const events: string[] = []

    try {
        for await (const event of agent.chatStream(question)) {
            events.push(event.type)

            switch (event.type) {
                case MCPLinkEventType.ITERATION_START:
                    iteration = event.data.iteration as number
                    console.log(`\n📍 === 迭代 ${iteration} 开始 ===`)
                    break

                case MCPLinkEventType.ITERATION_END:
                    console.log(`\n📍 === 迭代 ${event.data.iteration} 结束 ===`)
                    break

                case MCPLinkEventType.THINKING_START:
                    console.log('\n💭 [思考开始]')
                    break

                case MCPLinkEventType.THINKING_DELTA:
                    const thinking = event.data.content as string || ''
                    thinkingContent += thinking
                    process.stdout.write(thinking)
                    break

                case MCPLinkEventType.THINKING_END:
                    console.log('\n💭 [思考结束]')
                    break

                case MCPLinkEventType.TEXT_START:
                    console.log('\n📝 [文本开始]')
                    break

                case MCPLinkEventType.TEXT_DELTA:
                    const text = event.data.content as string || ''
                    textContent += text
                    process.stdout.write(text)
                    break

                case MCPLinkEventType.TEXT_END:
                    console.log('\n📝 [文本结束]')
                    break

                case MCPLinkEventType.TOOL_CALL_START:
                    toolCalls++
                    console.log(`\n🔧 [工具调用] ${event.data.toolName}`)
                    console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
                    break

                case MCPLinkEventType.TOOL_RESULT:
                    console.log(`   结果: ${JSON.stringify(event.data.toolResult).substring(0, 100)}...`)
                    console.log(`   耗时: ${event.data.duration}ms`)
                    break

                case MCPLinkEventType.COMPLETE:
                    console.log(`\n✅ 完成! 总耗时: ${event.data.totalDuration}ms, 总迭代: ${event.data.totalIterations}`)
                    break
            }
        }
    } catch (error) {
        console.error('\n❌ 错误:', error)
    }

    // 统计结果
    console.log('\n' + '='.repeat(70))
    console.log('📊 测试结果')
    console.log('='.repeat(70))
    console.log(`总迭代次数: ${iteration}`)
    console.log(`工具调用次数: ${toolCalls}`)
    console.log(`思考内容长度: ${thinkingContent.length} 字符`)
    console.log(`回复内容长度: ${textContent.length} 字符`)
    console.log(`事件序列: ${events.join(' -> ')}`)

    // 验证
    console.log('\n' + '-'.repeat(70))
    console.log('🔍 验证')
    console.log('-'.repeat(70))
    
    const hasToolCall = toolCalls > 0
    const hasResponse = textContent.length > 0
    const hasSecondIteration = iteration >= 2

    console.log(`工具调用: ${hasToolCall ? '✅' : '❌'}`)
    console.log(`第二次迭代: ${hasSecondIteration ? '✅' : '❌'}`)
    console.log(`最终回复: ${hasResponse ? '✅' : '❌'}`)

    if (hasToolCall && hasSecondIteration && hasResponse) {
        console.log('\n🎉 测试通过!')
    } else {
        console.log('\n⚠️ 测试失败!')
        if (!hasSecondIteration) {
            console.log('   问题: 工具调用后没有进入第二次迭代')
        }
        if (!hasResponse) {
            console.log('   问题: 没有最终回复')
        }
    }
}

testToolContinue().catch(console.error)


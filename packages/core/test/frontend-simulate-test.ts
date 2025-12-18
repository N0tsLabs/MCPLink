/**
 * 前端模拟测试 - 完全模拟前端调用后端 API 的方式
 * 这个测试直接调用后端 API，和前端 Chat.vue 的调用方式完全一致
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const BACKEND_URL = 'http://localhost:3000'

interface SSEEvent {
    type: string
    data: Record<string, unknown>
}

// 获取指定模型的 ID
async function getModelId(modelName: string): Promise<string | null> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models`)
        const data = await response.json() as { models: Array<{ id: string; model: string; enabled: boolean }> }
        const model = data.models.find(m => m.model === modelName && m.enabled)
        return model?.id || null
    } catch {
        return null
    }
}

async function simulateFrontend() {
    console.log('='.repeat(70))
    console.log('🖥️  前端模拟测试 - 完全模拟 Chat.vue 的调用方式')
    console.log('='.repeat(70))
    console.log(`后端地址: ${BACKEND_URL}`)

    // 指定使用 gpt-4o-mini 模型
    const targetModel = 'gpt-4o-mini'
    const modelId = await getModelId(targetModel)
    if (!modelId) {
        console.log(`❌ 找不到模型 "${targetModel}"，请确保该模型已启用`)
        return
    }
    console.log(`使用模型: ${targetModel} (${modelId})`)
    console.log('='.repeat(70))

    const message = '总结一下 wkea.cn'
    console.log(`\n发送消息: "${message}"\n`)

    // 统计
    const allEvents: SSEEvent[] = []
    let thinkingContent = ''
    let textContent = ''
    let toolCalls: string[] = []

    try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                stream: true,
                modelId,
            }),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('无法获取响应流')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEventType = ''

        console.log('-'.repeat(70))
        console.log('📥 SSE 事件流:')
        console.log('-'.repeat(70))

        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                console.log('\n[流结束]')
                break
            }

            buffer += decoder.decode(value, { stream: true })

            // 解析 SSE 事件
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEventType = line.slice(7).trim()
                } else if (line.startsWith('data: ') && currentEventType) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        const event: SSEEvent = { type: currentEventType, data }
                        allEvents.push(event)

                        // 打印每个事件
                        switch (currentEventType) {
                            case 'connected':
                                console.log('🔗 [connected]')
                                break
                            case 'iteration_start':
                                console.log(`\n📍 [iteration_start] 迭代 ${data.iteration}/${data.maxIterations}`)
                                break
                            case 'iteration_end':
                                console.log(`📍 [iteration_end] 迭代 ${data.iteration}`)
                                break
                            case 'thinking_start':
                                console.log('\n💭 [thinking_start]')
                                break
                            case 'thinking_delta':
                                thinkingContent += data.content || ''
                                process.stdout.write(data.content as string || '')
                                break
                            case 'thinking_end':
                                console.log('\n💭 [thinking_end]')
                                break
                            case 'text_start':
                                console.log('\n📝 [text_start]')
                                break
                            case 'text_delta':
                                textContent += data.content || ''
                                process.stdout.write(data.content as string || '')
                                break
                            case 'text_end':
                                console.log('\n📝 [text_end]')
                                break
                            case 'tool_call_start':
                                toolCalls.push(data.toolName as string)
                                console.log(`\n🔧 [tool_call_start] ${data.toolName}`)
                                console.log(`   参数: ${JSON.stringify(data.toolArgs)}`)
                                break
                            case 'tool_executing':
                                console.log(`   ⏳ [tool_executing]`)
                                break
                            case 'tool_result':
                                const preview = String(data.toolResult || '').substring(0, 100)
                                console.log(`   ✅ [tool_result] ${data.duration}ms`)
                                console.log(`   预览: ${preview}...`)
                                break
                            case 'complete':
                                console.log(`\n✅ [complete] 总耗时: ${data.totalDuration}ms, 迭代: ${data.totalIterations}`)
                                break
                            case 'error':
                                console.log(`\n❌ [error] ${data.error}`)
                                break
                            default:
                                console.log(`   [${currentEventType}]`, JSON.stringify(data).substring(0, 50))
                        }

                        currentEventType = ''
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
    } catch (error) {
        console.error('\n❌ 请求失败:', error)
        console.error('\n请确保后端已启动并已加载最新的 core 包')
        process.exit(1)
    }

    // 输出统计
    console.log('\n' + '='.repeat(70))
    console.log('📊 事件统计')
    console.log('='.repeat(70))

    // 按类型统计事件
    const eventCounts: Record<string, number> = {}
    for (const event of allEvents) {
        eventCounts[event.type] = (eventCounts[event.type] || 0) + 1
    }
    console.log('事件计数:', eventCounts)

    // 事件序列
    const eventSequence = allEvents.map(e => e.type)
    console.log('\n事件序列:')
    let lastType = ''
    let count = 0
    for (const type of eventSequence) {
        if (type === lastType) {
            count++
        } else {
            if (lastType) {
                console.log(`  ${lastType}${count > 1 ? ` x${count}` : ''}`)
            }
            lastType = type
            count = 1
        }
    }
    if (lastType) {
        console.log(`  ${lastType}${count > 1 ? ` x${count}` : ''}`)
    }

    // 验证结果
    console.log('\n' + '-'.repeat(70))
    console.log('🔍 验证结果')
    console.log('-'.repeat(70))

    const hasThinking = thinkingContent.length > 0
    const hasToolCall = toolCalls.length > 0
    const hasResponse = textContent.length > 0

    console.log(`思考过程: ${hasThinking ? '✅' : '❌'} (${thinkingContent.length} 字符)`)
    console.log(`工具调用: ${hasToolCall ? '✅' : '❌'} (${toolCalls.join(', ') || '无'})`)
    console.log(`最终回复: ${hasResponse ? '✅' : '❌'} (${textContent.length} 字符)`)

    // 检查关键事件
    const hasIterationStart = eventCounts['iteration_start'] > 0
    const hasIterationEnd = eventCounts['iteration_end'] > 0
    const hasComplete = eventCounts['complete'] > 0
    const hasSecondIteration = (eventCounts['iteration_start'] || 0) >= 2

    console.log(`\n关键事件检查:`)
    console.log(`  iteration_start: ${hasIterationStart ? '✅' : '❌'} (${eventCounts['iteration_start'] || 0}次)`)
    console.log(`  iteration_end: ${hasIterationEnd ? '✅' : '❌'} (${eventCounts['iteration_end'] || 0}次)`)
    console.log(`  complete: ${hasComplete ? '✅' : '❌'}`)
    console.log(`  第二次迭代: ${hasSecondIteration ? '✅' : '❌'}`)

    if (hasToolCall && !hasSecondIteration) {
        console.log('\n⚠️  问题: 有工具调用但没有第二次迭代!')
    }

    if (hasSecondIteration && !hasResponse) {
        console.log('\n⚠️  问题: 有第二次迭代但没有最终回复!')
    }

    // 输出详细内容
    if (thinkingContent) {
        console.log('\n' + '-'.repeat(70))
        console.log('💭 思考内容:')
        console.log('-'.repeat(70))
        console.log(thinkingContent)
    }

    if (textContent) {
        console.log('\n' + '-'.repeat(70))
        console.log('📝 回复内容:')
        console.log('-'.repeat(70))
        console.log(textContent)
    }

    const allPassed = hasThinking && hasToolCall && hasResponse
    console.log('\n' + '='.repeat(70))
    console.log(allPassed ? '🎉 测试通过!' : '⚠️  测试未通过 - 请检查上述问题')
    console.log('='.repeat(70))
}

simulateFrontend().catch(console.error)


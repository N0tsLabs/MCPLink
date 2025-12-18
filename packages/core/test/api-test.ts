/**
 * API 测试 - 直接调用后端接口
 * 测试思考 + 工具调用 + 回复的完整流程
 *
 * 使用方式：
 * 1. 确保后端已启动 (pnpm dev)
 * 2. 运行: npx tsx packages/core/test/api-test.ts
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// 获取项目根目录并加载 .env 文件
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

// ============ 配置 ============
const CONFIG = {
    // 后端 API 地址
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    // 测试问题
    question: 'wkea.cn 这个网站是做什么的？请获取网页内容后用中文详细总结',
}

// ============ 测试代码 ============

interface SSEEvent {
    type: string
    timestamp: number
    data: Record<string, unknown>
}

async function runTest() {
    console.log('='.repeat(70))
    console.log('🌐 API 测试 - 直接调用后端接口')
    console.log('='.repeat(70))
    console.log(`后端地址: ${CONFIG.apiUrl}`)
    console.log(`问题: ${CONFIG.question}`)
    console.log('='.repeat(70))
    console.log()

    // 统计
    const stats = {
        thinkingContent: '',
        textContent: '',
        toolCalls: [] as Array<{ name: string; duration: number }>,
        events: [] as SSEEvent[],
    }

    try {
        console.log('正在发送请求...\n')
        console.log('-'.repeat(70))

        const response = await fetch(`${CONFIG.apiUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: CONFIG.question,
                stream: true,
            }),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('无法获取响应流')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEventType = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // 解析 SSE 事件 (格式: event: type\ndata: json\n\n)
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEventType = line.slice(7).trim()
                } else if (line.startsWith('data: ') && currentEventType) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        const event: SSEEvent = {
                            type: currentEventType,
                            timestamp: Date.now(),
                            data,
                        }
                        stats.events.push(event)
                        currentEventType = ''

                        switch (event.type) {
                            case 'iteration_start':
                                console.log(`\n📍 迭代 ${event.data.iteration}/${event.data.maxIterations}`)
                                break

                            case 'thinking_start':
                                process.stdout.write('\n💭 思考中: ')
                                break

                            case 'thinking_delta':
                                if (event.data.content) {
                                    stats.thinkingContent += event.data.content as string
                                    process.stdout.write(event.data.content as string)
                                }
                                break

                            case 'thinking_end':
                                console.log('\n💭 思考结束')
                                break

                            case 'text_start':
                                process.stdout.write('\n💬 回复: ')
                                break

                            case 'text_delta':
                                if (event.data.content) {
                                    stats.textContent += event.data.content as string
                                    process.stdout.write(event.data.content as string)
                                }
                                break

                            case 'text_end':
                                console.log('\n')
                                break

                            case 'tool_call_start':
                                console.log(`\n🔧 工具调用: ${event.data.toolName}`)
                                console.log(`   参数: ${JSON.stringify(event.data.toolArgs)}`)
                                break

                            case 'tool_executing':
                                console.log(`   ⏳ 执行中...`)
                                break

                            case 'tool_result':
                                const resultPreview =
                                    typeof event.data.toolResult === 'string'
                                        ? (event.data.toolResult as string).substring(0, 200)
                                        : JSON.stringify(event.data.toolResult).substring(0, 200)
                                console.log(`   ✅ 完成 (${event.data.duration}ms)`)
                                console.log(`   结果预览: ${resultPreview}...`)
                                stats.toolCalls.push({
                                    name: event.data.toolName as string,
                                    duration: event.data.duration as number,
                                })
                                break

                            case 'complete':
                                console.log(
                                    `\n✅ 完成! 总耗时: ${event.data.totalDuration}ms, 迭代: ${event.data.totalIterations}`
                                )
                                break

                            case 'error':
                                console.error(`\n❌ 错误: ${event.data.error}`)
                                break
                        }
                    } catch {
                        // 忽略解析错误
                    }
                }
            }
        }
    } catch (error) {
        console.error('\n❌ 请求失败:', error)
        console.error('\n请确保后端已启动: pnpm dev')
        process.exit(1)
    }

    // 输出统计
    console.log('\n' + '='.repeat(70))
    console.log('📊 测试结果统计')
    console.log('='.repeat(70))
    console.log(`事件总数: ${stats.events.length}`)
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
        !!stats.textContent.match(/\{\s*"name"\s*:/)

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
}

// 运行测试
runTest().catch(console.error)


/**
 * TODO 功能测试
 * 测试：简单任务不应生成 TODO，复杂任务才生成
 */
import { config } from 'dotenv'
config({ path: '../../.env' })

import { MCPLink, MCPLinkEventType } from '../src/index.js'
import { createOpenAI } from '@ai-sdk/openai'

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.openai.com/v1'
const API_KEY = process.env.API_KEY
const MODEL = process.env.DEFAULT_MODEL || 'gpt-4o-mini'

if (!API_KEY) {
    console.error('❌ 请先配置 API_KEY')
    console.log('在项目根目录创建 .env 文件，内容如下：')
    console.log('API_KEY=sk-xxx')
    console.log('API_BASE_URL=https://api.openai.com/v1')
    console.log('DEFAULT_MODEL=gpt-4o-mini')
    process.exit(1)
}

async function testSimpleTask() {
    console.log('============================================================')
    console.log('测试 1: 简单任务 - 不应生成 TODO')
    console.log('============================================================')
    console.log(`模型: ${MODEL}`)
    console.log(`问题: 总结一下 wkea.cn 是什么网站（模拟简单任务）`)
    console.log('============================================================\n')

    const openai = createOpenAI({
        baseURL: API_BASE_URL,
        apiKey: API_KEY,
    })

    const mcpLink = new MCPLink({
        model: openai(MODEL),
        modelName: MODEL,
        mcpServers: {},
        systemPrompt: '你是一个智能助手。',
    })

    await mcpLink.initialize()

    let todoStarted = false
    let hasOutput = false

    for await (const event of mcpLink.chatStream('用一句话介绍一下你自己')) {
        if (event.type === MCPLinkEventType.TODO_START) {
            todoStarted = true
        }
        if (event.type === MCPLinkEventType.TEXT_DELTA) {
            process.stdout.write(event.data.content || '')
            hasOutput = true
        }
    }

    console.log('\n')
    console.log(`结果: ${!todoStarted ? '✅ 简单任务没有生成 TODO' : '❌ 简单任务错误地生成了 TODO'}`)
    console.log(`有输出: ${hasOutput ? '✅' : '❌'}`)
    return !todoStarted && hasOutput
}

async function testTodo() {
    console.log('\n============================================================')
    console.log('测试 2: TODO 功能 - 不应重复创建')
    console.log('============================================================')
    console.log(`模型: ${MODEL}`)
    console.log(`测试: TODO 创建和状态更新（不重复）`)
    console.log('============================================================\n')

    const openai = createOpenAI({
        baseURL: API_BASE_URL,
        apiKey: API_KEY,
    })

    const mcpLink = new MCPLink({
        model: openai(MODEL),
        modelName: MODEL,
        mcpServers: {},
        systemPrompt: '你是一个任务执行助手。',
    })

    console.log('正在初始化...')
    await mcpLink.initialize()
    console.log('初始化完成\n')

    // 统计
    let todoStartCount = 0
    let todoItemCount = 0
    let todoUpdateCount = 0
    let toolCallCount = 0
    let fakeToolResultCount = 0
    const todoItems: Array<{ id: string; content: string; status: string }> = []

    for await (const event of mcpLink.chatStream(
        '写一个简短的故事，讲述一只猫的冒险（100字以内）'
    )) {
        switch (event.type) {
            case MCPLinkEventType.TODO_START:
                todoStartCount++
                console.log(`\n📋 [TODO 开始] ${event.data.todoTitle}`)
                break

            case MCPLinkEventType.TODO_ITEM_ADD:
                todoItemCount++
                const item = {
                    id: event.data.todoItemId || '',
                    content: event.data.todoItemContent || '',
                    status: event.data.todoItemStatus || 'pending',
                }
                todoItems.push(item)
                console.log(`  ➕ [TODO ${item.id}] ${item.content}`)
                break

            case MCPLinkEventType.TODO_ITEM_UPDATE:
                todoUpdateCount++
                const updateId = event.data.todoItemId
                const newStatus = event.data.todoItemStatus
                const result = event.data.todoItemResult
                const icon = newStatus === 'completed' ? '✅' : newStatus === 'in_progress' ? '🔄' : '⏳'
                console.log(`  ${icon} [TODO ${updateId}] -> ${newStatus}${result ? ` | ${result}` : ''}`)

                // 更新本地记录
                const existingItem = todoItems.find((i) => i.id === updateId)
                if (existingItem) {
                    existingItem.status = newStatus || existingItem.status
                }
                break

            case MCPLinkEventType.TODO_END:
                console.log(`📋 [TODO 结束]`)
                break

            case MCPLinkEventType.TOOL_CALL_START:
                toolCallCount++
                console.log(`\n🔧 [工具调用] ${event.data.toolName}`)
                break

            case MCPLinkEventType.THINKING_START:
                console.log('\n💭 [思考开始]')
                break

            case MCPLinkEventType.THINKING_END:
                console.log('💭 [思考结束]')
                break

            case MCPLinkEventType.TEXT_DELTA:
                process.stdout.write(event.data.content || '')
                break

            case MCPLinkEventType.ITERATION_START:
                console.log(`\n--- 迭代 ${event.data.iteration}/${event.data.maxIterations} ---`)
                break
        }
    }

    console.log('\n\n============================================================')
    console.log('测试 2 结果统计')
    console.log('============================================================')
    console.log(`TODO 创建次数: ${todoStartCount} (预期: 0 或 1)`)
    console.log(`TODO 项数量: ${todoItemCount}`)
    console.log(`TODO 更新数量: ${todoUpdateCount}`)
    
    // 检查是否有重复创建 TODO
    const noRepeat = todoStartCount <= 1
    console.log(`\n没有重复创建 TODO: ${noRepeat ? '✅' : '❌ 创建了 ' + todoStartCount + ' 次'}`)
    
    return noRepeat
}

async function runAllTests() {
    console.log('============================================================')
    console.log('开始测试 TODO 功能修复')
    console.log('============================================================\n')

    const test1Pass = await testSimpleTask()
    const test2Pass = await testTodo()

    console.log('\n============================================================')
    console.log('总结')
    console.log('============================================================')
    console.log(`测试 1 (简单任务不生成 TODO): ${test1Pass ? '✅ 通过' : '❌ 失败'}`)
    console.log(`测试 2 (TODO 不重复创建): ${test2Pass ? '✅ 通过' : '❌ 失败'}`)
    console.log(`总体: ${test1Pass && test2Pass ? '✅ 全部通过' : '❌ 有失败'}`)
}

runAllTests().catch(console.error)


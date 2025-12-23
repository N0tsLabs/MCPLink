import { ref, shallowRef, computed, nextTick, watch, onMounted, onUnmounted, triggerRef } from 'vue';
import { useAppStore } from '@/stores/app';
import { api } from '@/api';
import MarkdownRenderer from '@/components/MarkdownRenderer.vue';
import DebugPanel from '@/components/DebugPanel.vue';
const store = useAppStore();
const messagesRef = ref(null);
const inputRef = ref(null);
const streamingThinkingRef = ref(null);
const inputMessage = ref('');
const isGenerating = ref(false);
// 使用 shallowRef 配合手动 triggerRef 来确保响应式更新
const messages = shallowRef([]);
const showToolsPanel = ref(false);
// 实时思考计时器
const liveThinkingTime = ref(0);
let thinkingTimerInterval = null;
// 当前请求控制器
let abortController = null;
// 流式文本缓冲（响应式，直接绑定到模板）
const streamingBuffer = ref('');
const streamingThinkingBuffer = ref('');
// 滚动动画帧 ID
let scrollAnimationFrameId = null;
// 活跃超时定时器（用于检测服务端无响应）
let activityTimeoutId = null;
const ACTIVITY_TIMEOUT = 60000; // 60秒无活动超时
// 调试日志
const debugLogs = ref([]);
const showDebugPanel = ref(true); // 默认显示调试面板
// 添加调试日志
function addDebugLog(type, tag, message, data) {
    debugLogs.value.push({
        timestamp: Date.now(),
        type,
        tag,
        message,
        data
    });
    // 限制日志数量
    if (debugLogs.value.length > 200) {
        debugLogs.value = debugLogs.value.slice(-150);
    }
}
// 清空调试日志
function clearDebugLogs() {
    debugLogs.value = [];
}
// 开始思考计时
function startThinkingTimer() {
    liveThinkingTime.value = 0;
    thinkingTimerInterval = window.setInterval(() => {
        liveThinkingTime.value++;
    }, 1000);
}
// 停止思考计时
function stopThinkingTimer() {
    if (thinkingTimerInterval) {
        clearInterval(thinkingTimerInterval);
        thinkingTimerInterval = null;
    }
}
// 重置活跃超时
function resetActivityTimeout(onTimeout) {
    if (activityTimeoutId) {
        clearTimeout(activityTimeoutId);
    }
    activityTimeoutId = window.setTimeout(() => {
        console.warn('[Chat] Activity timeout - no response from server');
        onTimeout();
    }, ACTIVITY_TIMEOUT);
}
// 清除活跃超时
function clearActivityTimeout() {
    if (activityTimeoutId) {
        clearTimeout(activityTimeoutId);
        activityTimeoutId = null;
    }
}
// 检查消息是否有工具调用
function hasToolCalls(msg) {
    return !!(msg.toolCalls && msg.toolCalls.length > 0);
}
// 检查消息是否正在流式输出文本
function isStreamingText(msg) {
    return msg.status === 'generating' && streamingBuffer.value.length > 0;
}
// 获取状态显示文本
function getStatusText(msg) {
    switch (msg.status) {
        case 'thinking':
            return '正在思考...';
        case 'calling_tool':
            return '正在调用工具...';
        case 'generating':
            return '正在生成...';
        default:
            return '处理中...';
    }
}
// 强制触发消息列表更新
function forceUpdate() {
    triggerRef(messages);
}
// 切换工具展开状态
function toggleToolExpand(tool) {
    if (!tool)
        return;
    tool.expanded = !tool.expanded;
    messages.value = [...messages.value];
}
// 切换思考过程展开状态
function toggleThinkingExpand(msg) {
    msg.thinkingExpanded = !msg.thinkingExpanded;
    messages.value = [...messages.value];
}
// 切换步骤中的思考展开状态
function toggleStepThinkingExpand(step) {
    if (!step)
        return;
    if (step.type === 'thinking') {
        step.expanded = !step.expanded;
        messages.value = [...messages.value];
    }
}
// 切换 TODO 展开状态
function toggleTodoExpand(todo) {
    if (!todo)
        return;
    todo.expanded = !todo.expanded;
    messages.value = [...messages.value];
}
// 获取 TODO 进度文本
function getTodoProgress(todo) {
    const completed = todo.items.filter((i) => i.status === 'completed').length;
    const total = todo.items.length;
    return `${completed}/${total}`;
}
// 获取当前活动的 TODO 列表（从最后一个 AI 消息中）
const activeTodoList = computed(() => {
    // 从后往前找第一个有 todoList 的 AI 消息
    for (let i = messages.value.length - 1; i >= 0; i--) {
        const msg = messages.value[i];
        if (msg.role === 'assistant' && msg.todoList && msg.todoList.items.length > 0) {
            // 检查是否有未完成的项目
            const hasIncomplete = msg.todoList.items.some((item) => item.status === 'pending' || item.status === 'in_progress');
            // 只有在正在生成或有未完成项时才显示
            if (isGenerating.value || hasIncomplete) {
                return msg.todoList;
            }
        }
    }
    return null;
});
// 工具选择相关
const selectedToolsLabel = computed(() => {
    if (store.selectedToolNames.length === 0) {
        return `全部工具 (${store.availableTools.length})`;
    }
    if (store.selectedToolNames.length === 1) {
        return store.selectedToolNames[0];
    }
    return `${store.selectedToolNames.length} 个工具`;
});
function isToolSelected(toolName) {
    if (store.selectedToolNames.length === 0)
        return true;
    return store.selectedToolNames.includes(toolName);
}
function toggleToolSelection(toolName) {
    const currentSelected = store.selectedToolNames.length === 0 ? store.availableTools.map((t) => t.name) : [...store.selectedToolNames];
    const index = currentSelected.indexOf(toolName);
    if (index === -1) {
        currentSelected.push(toolName);
    }
    else {
        currentSelected.splice(index, 1);
    }
    if (currentSelected.length === store.availableTools.length) {
        store.setSelectedTools([]);
    }
    else {
        store.setSelectedTools(currentSelected);
    }
}
// 监听会话切换
watch(() => store.currentConversationId, async (id) => {
    if (id) {
        const conv = store.conversations.find((c) => c.id === id);
        if (conv) {
            messages.value = conv.messages.map((m, i) => {
                // 构建 steps 数组
                const steps = [];
                // 优先从保存的 steps 数据恢复
                const savedSteps = m.steps;
                if (savedSteps && Array.isArray(savedSteps) && savedSteps.length > 0) {
                    for (let si = 0; si < savedSteps.length; si++) {
                        const s = savedSteps[si];
                        if (s.type === 'thinking') {
                            steps.push({
                                type: 'thinking',
                                content: s.content || '',
                                duration: s.duration,
                                expanded: false,
                                isStreaming: false,
                            });
                        }
                        else if (s.type === 'tool') {
                            steps.push({
                                type: 'tool',
                                tool: {
                                    id: `tool-${i}-${si}`,
                                    name: s.name,
                                    args: s.args || s.arguments || {},
                                    result: s.result,
                                    duration: s.duration,
                                    status: (s.status === 'error' ? 'error' : 'success'),
                                    expanded: false,
                                },
                            });
                        }
                    }
                }
                else {
                    // 兼容旧数据：从 thinking 和 toolCalls 构建
                    if (m.thinking) {
                        steps.push({
                            type: 'thinking',
                            content: m.thinking,
                            duration: m.thinkingDuration,
                            expanded: false,
                            isStreaming: false,
                        });
                    }
                    if (m.toolCalls) {
                        for (let ti = 0; ti < m.toolCalls.length; ti++) {
                            const tc = m.toolCalls[ti];
                            steps.push({
                                type: 'tool',
                                tool: {
                                    id: `tool-${i}-${ti}`,
                                    name: tc.name,
                                    args: tc.arguments,
                                    result: tc.result,
                                    duration: tc.duration,
                                    status: (tc.status === 'error' ? 'error' : 'success'),
                                    expanded: false,
                                },
                            });
                        }
                    }
                }
                return {
                    id: `msg-${i}`,
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp,
                    status: 'done',
                    thinking: m.thinking,
                    thinkingExpanded: false,
                    thinkingDuration: m.thinkingDuration,
                    steps,
                    toolCalls: m.toolCalls?.map((tc, ti) => ({
                        id: `tool-${i}-${ti}`,
                        name: tc.name,
                        args: tc.arguments,
                        result: tc.result,
                        duration: tc.duration,
                        status: (tc.status === 'error' ? 'error' : 'success'),
                        expanded: false,
                    })),
                };
            });
            scrollToBottom();
        }
    }
    else {
        messages.value = [];
    }
}, { immediate: true });
// 滚动到底部
function scrollToBottom() {
    requestAnimationFrame(() => {
        if (messagesRef.value) {
            messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
        }
    });
}
// 自动调整输入框高度
function autoResize() {
    if (inputRef.value) {
        inputRef.value.style.height = 'auto';
        inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 150) + 'px';
    }
}
// 处理键盘事件
function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating.value) {
            sendMessage();
        }
    }
}
// 格式化 JSON
function formatJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    }
    catch {
        return String(obj);
    }
}
// 格式化工具结果（完整版，不截断）
function formatToolResultFull(result) {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result);
            return JSON.stringify(parsed, null, 2);
        }
        catch {
            return result;
        }
    }
    return formatJson(result);
}
// 格式化工具结果（用于预览，可能截断）
function formatToolResult(result) {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result);
            return JSON.stringify(parsed, null, 2);
        }
        catch {
            return result.length > 1000 ? result.slice(0, 1000) + '...' : result;
        }
    }
    return formatJson(result);
}
// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // 简单提示
        const msg = document.createElement('div');
        msg.textContent = '已复制到剪贴板';
        msg.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--accent-color);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            z-index: 10000;
            animation: fadeInOut 1.5s ease;
        `;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 1500);
    }).catch(() => {
        // 备用方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}
// 解析内容中的 <think> 标签（备用方案）
function parseThinkTags(content) {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let thinking = '';
    let text = content;
    // 提取所有 <think> 标签内容
    let match;
    while ((match = thinkRegex.exec(content)) !== null) {
        thinking += (thinking ? '\n\n' : '') + match[1].trim();
    }
    // 移除 <think> 标签
    text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return { thinking, text };
}
// 格式化工具结果
function formatResult(result) {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result);
            return JSON.stringify(parsed, null, 2);
        }
        catch {
            return result.length > 1000 ? result.slice(0, 1000) + '...' : result;
        }
    }
    return formatJson(result);
}
// 获取结果预览
function getResultPreview(result) {
    let text = '';
    if (typeof result === 'string') {
        text = result;
    }
    else {
        text = JSON.stringify(result);
    }
    text = text.replace(/[\n\r]+/g, ' ').trim();
    return text.length > 50 ? text.slice(0, 50) + '...' : text;
}
// 获取错误预览
function getErrorPreview(result) {
    let text = '';
    if (typeof result === 'string') {
        text = result;
    }
    else if (result && typeof result === 'object') {
        // 尝试提取错误消息
        const obj = result;
        text = obj.message || obj.error || JSON.stringify(result);
    }
    else {
        text = String(result);
    }
    text = text.replace(/[\n\r]+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '...' : text;
}
// 节流滚动到底部
function throttledScroll() {
    if (!scrollAnimationFrameId) {
        scrollAnimationFrameId = requestAnimationFrame(() => {
            // 滚动思考内容区域
            if (streamingThinkingRef.value) {
                streamingThinkingRef.value.scrollTop = streamingThinkingRef.value.scrollHeight;
            }
            // 滚动消息区域
            scrollToBottom();
            scrollAnimationFrameId = null;
        });
    }
}
// 追加流式文本（响应式，即时更新）
function appendStreamingText(text) {
    streamingBuffer.value += text;
    throttledScroll();
}
// 追加流式思考（响应式，即时更新）
function appendStreamingThinking(text) {
    streamingThinkingBuffer.value += text;
    throttledScroll();
}
// 停止生成
function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    clearActivityTimeout();
    stopThinkingTimer();
    const lastMsg = messages.value[messages.value.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
        // 保存流式思考内容
        if (lastMsg.isThinkingStream && streamingThinkingBuffer.value) {
            lastMsg.thinking = streamingThinkingBuffer.value;
            lastMsg.isThinkingStream = false;
            if (lastMsg.thinkingStartTime) {
                lastMsg.thinkingDuration = Math.round((Date.now() - lastMsg.thinkingStartTime) / 1000);
            }
        }
        lastMsg.content = streamingBuffer.value || lastMsg.content;
        lastMsg.status = 'done';
        forceUpdate();
    }
    isGenerating.value = false;
    streamingBuffer.value = '';
    streamingThinkingBuffer.value = '';
}
// 发送消息
async function sendMessage() {
    const message = inputMessage.value.trim();
    if (!message || isGenerating.value)
        return;
    addDebugLog('request', 'SEND', `发送消息: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`, {
        fullMessage: message,
        modelId: store.currentModelId,
        conversationId: store.currentConversationId,
        isGenerating: isGenerating.value
    });
    inputMessage.value = '';
    if (inputRef.value) {
        inputRef.value.style.height = 'auto';
    }
    if (!store.currentConversationId) {
        addDebugLog('info', 'INIT', '创建新会话');
        await store.createConversation();
        addDebugLog('success', 'INIT', `会话已创建: ${store.currentConversationId}`);
    }
    // 添加用户消息
    const userMsg = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
        steps: [],
    };
    // 准备 AI 消息
    const aiMsg = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'thinking',
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        steps: [],
    };
    // 更新消息列表
    messages.value = [...messages.value, userMsg, aiMsg];
    scrollToBottom();
    isGenerating.value = true;
    streamingBuffer.value = '';
    streamingThinkingBuffer.value = '';
    showToolsPanel.value = false;
    await nextTick();
    scrollToBottom();
    const selectedTools = store.selectedToolNames.length > 0 ? store.selectedToolNames : undefined;
    const toolCallMap = new Map();
    // 获取 aiMsg 的引用（用于更新）
    const getAiMsg = () => messages.value[messages.value.length - 1];
    // 超时处理函数
    const handleTimeout = () => {
        addDebugLog('error', 'TIMEOUT', `请求超时 (${ACTIVITY_TIMEOUT / 1000}秒无响应)`, {
            streamingBufferLength: streamingBuffer.value.length,
            streamingThinkingLength: streamingThinkingBuffer.value.length
        });
        const aiMsg = getAiMsg();
        stopThinkingTimer();
        clearActivityTimeout();
        // 更新正在运行的工具为超时状态
        aiMsg.steps.forEach((step) => {
            if (step.type === 'tool' && step.tool.status === 'running') {
                step.tool.status = 'error';
                step.tool.result = '请求超时，服务端无响应';
            }
        });
        // 如果有流式内容，保存它
        if (streamingBuffer.value) {
            aiMsg.content = streamingBuffer.value;
        }
        else if (!aiMsg.content) {
            aiMsg.content = '请求超时，服务端无响应。请检查网络连接或重试。';
        }
        aiMsg.status = 'done';
        forceUpdate();
        isGenerating.value = false;
        streamingBuffer.value = '';
        streamingThinkingBuffer.value = '';
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    };
    // 启动初始活跃超时
    resetActivityTimeout(handleTimeout);
    addDebugLog('request', 'API', '开始 SSE 请求', {
        url: `${api.getBaseUrl()}/api/chat`,
        modelId: store.currentModelId,
        conversationId: store.currentConversationId,
        tools: selectedTools
    });
    abortController = api.chat(message, {
        modelId: store.currentModelId || undefined,
        conversationId: store.currentConversationId || undefined,
        tools: selectedTools,
        onEvent: (event) => {
            const aiMsg = getAiMsg();
            // 收到任何事件都重置超时
            resetActivityTimeout(handleTimeout);
            // 记录所有事件
            addDebugLog('event', 'SSE', `收到事件: ${event.type}`, event.data);
            switch (event.type) {
                case 'connected':
                    console.log('[SSE] Connected');
                    addDebugLog('success', 'SSE', '连接已建立');
                    break;
                case 'iteration_start':
                    console.log('[SSE] Iteration start:', event.data.iteration);
                    aiMsg.status = 'thinking';
                    forceUpdate();
                    scrollToBottom();
                    break;
                case 'thinking_start': {
                    // 开始流式思考 - 创建新的思考步骤
                    console.log('[SSE] Thinking start');
                    const thinkStep = {
                        type: 'thinking',
                        content: '',
                        expanded: true, // 流式时展开
                        isStreaming: true,
                        startTime: Date.now(),
                    };
                    aiMsg.steps.push(thinkStep);
                    aiMsg.isThinkingStream = true;
                    streamingThinkingBuffer.value = '';
                    startThinkingTimer();
                    forceUpdate();
                    break;
                }
                case 'thinking_delta':
                    // 流式思考内容 - 更新当前思考步骤
                    if (event.data.content) {
                        appendStreamingThinking(event.data.content);
                    }
                    break;
                case 'thinking_end': {
                    // 思考结束，完成当前思考步骤
                    console.log('[SSE] Thinking end');
                    stopThinkingTimer();
                    // 找到最后一个思考步骤并更新
                    const lastThinkStep = [...aiMsg.steps].reverse().find((s) => s.type === 'thinking');
                    if (lastThinkStep && lastThinkStep.type === 'thinking') {
                        lastThinkStep.content = streamingThinkingBuffer.value;
                        lastThinkStep.isStreaming = false;
                        lastThinkStep.expanded = false; // 自动折叠
                        if (lastThinkStep.startTime) {
                            lastThinkStep.duration = Math.round((Date.now() - lastThinkStep.startTime) / 1000);
                        }
                    }
                    aiMsg.isThinkingStream = false;
                    aiMsg.status = 'calling_tool'; // 思考结束后，显示"正在调用工具"状态
                    streamingThinkingBuffer.value = '';
                    forceUpdate();
                    scrollToBottom();
                    break;
                }
                case 'thinking_content':
                    // 非流式思考内容（用于工具调用时的中间思考）
                    console.log('[SSE] Thinking content');
                    if (event.data.content) {
                        aiMsg.thinking = (aiMsg.thinking || '') + event.data.content;
                        forceUpdate();
                    }
                    break;
                case 'text_start':
                    console.log('[SSE] Text start');
                    aiMsg.status = 'generating';
                    forceUpdate();
                    break;
                case 'text_delta':
                    if (event.data.content) {
                        appendStreamingText(event.data.content);
                    }
                    break;
                case 'text_end':
                    console.log('[SSE] Text end');
                    break;
                case 'tool_call_start': {
                    console.log('[SSE] Tool call start:', event.data.toolName);
                    aiMsg.status = 'calling_tool';
                    const toolCall = {
                        id: event.data.toolCallId || `tool-${Date.now()}`,
                        name: event.data.toolName || '',
                        args: event.data.toolArgs || {},
                        result: undefined,
                        duration: 0,
                        status: 'running',
                        expanded: false,
                    };
                    if (!aiMsg.toolCalls)
                        aiMsg.toolCalls = [];
                    aiMsg.toolCalls.push(toolCall);
                    toolCallMap.set(toolCall.id, toolCall);
                    // 添加到 steps 数组
                    aiMsg.steps.push({ type: 'tool', tool: toolCall });
                    forceUpdate();
                    scrollToBottom();
                    break;
                }
                case 'tool_executing': {
                    console.log('[SSE] Tool executing:', event.data.toolName);
                    const tool = toolCallMap.get(event.data.toolCallId || '');
                    if (tool) {
                        tool.status = 'running';
                        if (event.data.toolArgs) {
                            tool.args = event.data.toolArgs;
                        }
                        forceUpdate();
                    }
                    break;
                }
                case 'tool_result': {
                    const resultToolCallId = event.data.toolCallId || '';
                    console.log('[SSE] Tool result:', event.data.toolName, 'toolCallId:', resultToolCallId, 'duration:', event.data.duration, 'ms');
                    console.log('[SSE] toolCallMap keys:', Array.from(toolCallMap.keys()));
                    console.log('[SSE] aiMsg.toolCalls:', aiMsg.toolCalls?.map(t => ({ id: t.id, name: t.name, status: t.status })));
                    let tool = toolCallMap.get(resultToolCallId);
                    // Fallback 1: 如果通过 ID 找不到，按工具名称查找最近的未完成工具
                    if (!tool && event.data.toolName && aiMsg.toolCalls) {
                        console.log('[SSE] Tool not found by ID, searching by name:', event.data.toolName);
                        tool = aiMsg.toolCalls.find((t) => t.name === event.data.toolName && t.status === 'running');
                    }
                    // Fallback 2: 如果还是找不到，查找任何同名工具（可能状态已被改变）
                    if (!tool && event.data.toolName && aiMsg.toolCalls) {
                        console.log('[SSE] Fallback 2: searching any tool with name:', event.data.toolName);
                        tool = aiMsg.toolCalls.find((t) => t.name === event.data.toolName && !t.result);
                    }
                    // Fallback 3: 直接从 steps 中查找
                    if (!tool && event.data.toolName && aiMsg.steps) {
                        console.log('[SSE] Fallback 3: searching in steps');
                        const toolStep = aiMsg.steps.find((s) => s.type === 'tool' && s.tool.name === event.data.toolName && !s.tool.result);
                        if (toolStep && toolStep.type === 'tool') {
                            tool = toolStep.tool;
                        }
                    }
                    if (tool) {
                        tool.result = event.data.toolResult;
                        tool.duration = event.data.duration || 0;
                        tool.status = event.data.isError ? 'error' : 'success';
                        console.log('[SSE] Tool status updated to:', tool.status, 'result length:', (event.data.toolResult || '').length);
                        forceUpdate();
                    }
                    else {
                        console.error('[SSE] ❌ Tool not found for result:', event.data.toolName, resultToolCallId);
                        console.error('[SSE] Available tools:', aiMsg.toolCalls);
                        console.error('[SSE] Available steps:', aiMsg.steps?.filter(s => s.type === 'tool'));
                    }
                    scrollToBottom();
                    break;
                }
                case 'iteration_end':
                    console.log('[SSE] Iteration end:', event.data.iteration);
                    break;
                case 'todo_start': {
                    console.log('[SSE] TODO start:', event.data.todoTitle);
                    const todoStep = {
                        type: 'todo',
                        todo: {
                            id: event.data.todoId || `todo-${Date.now()}`,
                            title: event.data.todoTitle || '任务规划',
                            items: [],
                            expanded: true,
                        },
                    };
                    aiMsg.steps.push(todoStep);
                    aiMsg.todoList = todoStep.todo;
                    forceUpdate();
                    scrollToBottom();
                    break;
                }
                case 'todo_item_add': {
                    console.log('[SSE] TODO item add:', event.data.todoItemContent);
                    if (aiMsg.todoList) {
                        aiMsg.todoList.items.push({
                            id: event.data.todoItemId || `item-${Date.now()}`,
                            content: event.data.todoItemContent || '',
                            status: event.data.todoItemStatus || 'pending',
                        });
                        forceUpdate();
                        scrollToBottom();
                    }
                    break;
                }
                case 'todo_item_update': {
                    console.log('[SSE] TODO item update:', event.data.todoItemId, event.data.todoItemStatus);
                    if (aiMsg.todoList) {
                        const item = aiMsg.todoList.items.find((i) => i.id === event.data.todoItemId);
                        if (item) {
                            item.status = event.data.todoItemStatus || item.status;
                            if (event.data.todoItemResult) {
                                item.result = event.data.todoItemResult;
                            }
                            forceUpdate();
                        }
                    }
                    break;
                }
                case 'todo_end':
                    console.log('[SSE] TODO end');
                    break;
                case 'error':
                    console.error('[SSE] Error:', event.data.error);
                    addDebugLog('error', 'SSE', `服务端错误: ${event.data.error}`, event.data);
                    clearActivityTimeout();
                    stopThinkingTimer();
                    // 更新正在运行的工具为错误状态
                    aiMsg.steps.forEach((step) => {
                        if (step.type === 'tool' && step.tool.status === 'running') {
                            step.tool.status = 'error';
                            step.tool.result = event.data.error || '未知错误';
                        }
                    });
                    // 如果有部分内容，保存它
                    if (streamingBuffer.value) {
                        aiMsg.content = streamingBuffer.value + `\n\n⚠️ 发生错误: ${event.data.error}`;
                    }
                    else {
                        aiMsg.content = `❌ 错误: ${event.data.error}`;
                    }
                    aiMsg.status = 'done';
                    forceUpdate();
                    isGenerating.value = false;
                    streamingBuffer.value = '';
                    streamingThinkingBuffer.value = '';
                    break;
                case 'complete':
                    console.log('[SSE] Complete');
                    addDebugLog('success', 'SSE', '流式响应完成', event.data);
                    break;
            }
        },
        onError: (error) => {
            console.error('Chat error:', error);
            addDebugLog('error', 'FETCH', `请求错误: ${error.message}`, {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            clearActivityTimeout();
            stopThinkingTimer();
            const aiMsg = getAiMsg();
            if (error.name !== 'AbortError') {
                // 更新正在运行的工具为错误状态
                aiMsg.steps.forEach((step) => {
                    if (step.type === 'tool' && step.tool.status === 'running') {
                        step.tool.status = 'error';
                        step.tool.result = error.message || '请求失败';
                    }
                });
                // 如果有部分内容，保存它
                if (streamingBuffer.value) {
                    aiMsg.content = streamingBuffer.value + `\n\n⚠️ 请求失败: ${error.message}`;
                }
                else {
                    aiMsg.content = `❌ 请求失败: ${error.message}`;
                }
                aiMsg.status = 'done';
                forceUpdate();
            }
            else {
                addDebugLog('warn', 'ABORT', '请求被用户取消');
            }
            isGenerating.value = false;
            streamingBuffer.value = '';
            streamingThinkingBuffer.value = '';
        },
        onComplete: async () => {
            console.log('[SSE] onComplete called');
            addDebugLog('success', 'COMPLETE', 'SSE 流已结束', {
                streamingBufferLength: streamingBuffer.value.length,
                stepsCount: getAiMsg().steps.length
            });
            clearActivityTimeout();
            stopThinkingTimer();
            const aiMsg = getAiMsg();
            // 解析内容中可能残留的 <think> 标签
            const rawContent = streamingBuffer.value;
            const { thinking: parsedThinking, text: cleanText } = parseThinkTags(rawContent);
            // 如果解析出思考内容，合并到已有的思考过程中
            if (parsedThinking) {
                aiMsg.thinking = (aiMsg.thinking ? aiMsg.thinking + '\n\n' : '') + parsedThinking;
                aiMsg.content = cleanText;
                // 如果之前没有思考时间，设置一个
                if (!aiMsg.thinkingDuration && aiMsg.thinkingStartTime) {
                    aiMsg.thinkingDuration = Math.round((Date.now() - aiMsg.thinkingStartTime) / 1000);
                }
            }
            else {
                aiMsg.content = rawContent;
            }
            aiMsg.status = 'done';
            aiMsg.isThinkingStream = false;
            forceUpdate();
            isGenerating.value = false;
            streamingBuffer.value = '';
            abortController = null;
            await saveConversation();
            if (messages.value.length === 2 && store.currentConversationId) {
                generateTitle(userMsg.content, aiMsg.content);
            }
        },
    });
}
// 保存会话
async function saveConversation() {
    if (store.currentConversationId) {
        const storedMessages = messages.value.map((m) => {
            // 从 steps 中提取思考内容（合并所有思考步骤）
            const thinkingFromSteps = m.steps
                ?.filter((s) => s.type === 'thinking')
                .map((s) => s.content)
                .join('\n\n');
            // 从 steps 中提取工具调用
            const toolCallsFromSteps = m.steps
                ?.filter((s) => s.type === 'tool')
                .map((s) => {
                const tool = s.tool;
                // 将内部 status 转换为 API 兼容的 status
                const apiStatus = tool.status === 'running' ? 'executing' : tool.status;
                return {
                    name: tool.name,
                    arguments: tool.args,
                    result: tool.result,
                    duration: tool.duration,
                    status: apiStatus,
                };
            });
            return {
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
                thinking: thinkingFromSteps || m.thinking,
                thinkingDuration: m.thinkingDuration,
                // 保存 steps 数据以便恢复
                steps: m.steps?.map((s) => {
                    if (s.type === 'thinking') {
                        return {
                            type: 'thinking',
                            content: s.content,
                            duration: s.duration,
                        };
                    }
                    else if (s.type === 'tool') {
                        return {
                            type: 'tool',
                            name: s.tool.name,
                            args: s.tool.args,
                            result: s.tool.result,
                            duration: s.tool.duration,
                            status: s.tool.status,
                        };
                    }
                    else {
                        // todo type
                        return {
                            type: 'thinking',
                            content: `TODO: ${s.todo.title || '任务'}`,
                            duration: 0,
                        };
                    }
                }),
                toolCalls: toolCallsFromSteps ||
                    m.toolCalls?.map((tc) => {
                        const apiStatus = tc.status === 'running' ? 'executing' : tc.status;
                        return {
                            name: tc.name,
                            arguments: tc.args,
                            result: tc.result,
                            duration: tc.duration,
                            status: apiStatus,
                        };
                    }),
            };
        });
        await api.updateConversation(store.currentConversationId, {
            messages: storedMessages,
        });
    }
}
// 生成对话标题
async function generateTitle(userMessage, assistantMessage) {
    if (!store.currentConversationId)
        return;
    try {
        const { title } = await api.generateConversationTitle(store.currentConversationId, userMessage, assistantMessage);
        store.updateConversationTitle(store.currentConversationId, title);
    }
    catch (error) {
        console.error('Failed to generate title:', error);
    }
}
onMounted(() => {
    inputRef.value?.focus();
});
onUnmounted(() => {
    if (abortController) {
        abortController.abort();
    }
    if (scrollAnimationFrameId) {
        cancelAnimationFrame(scrollAnimationFrameId);
    }
    clearActivityTimeout();
    stopThinkingTimer();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-time']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-content']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['running']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-header']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-text']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-code']} */ ;
/** @type {__VLS_StyleScopedClasses['full-result']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-option']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-option']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-option']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-status']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-text']} */ ;
/** @type {__VLS_StyleScopedClasses['input-box']} */ ;
/** @type {__VLS_StyleScopedClasses['input-box']} */ ;
/** @type {__VLS_StyleScopedClasses['input-box']} */ ;
/** @type {__VLS_StyleScopedClasses['send-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['send-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['send-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['stop-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['stop-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chat" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "messages-container" },
    ref: "messagesRef",
});
/** @type {typeof __VLS_ctx.messagesRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "messages-wrapper" },
});
if (__VLS_ctx.messages.length === 0 && !__VLS_ctx.isGenerating) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "welcome" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "welcome-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
const __VLS_0 = {}.TransitionGroup;
/** @type {[typeof __VLS_components.TransitionGroup, typeof __VLS_components.TransitionGroup, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    name: "message",
}));
const __VLS_2 = __VLS_1({
    name: "message",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [msg, index] of __VLS_getVForSourceType((__VLS_ctx.messages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (msg.id),
        ...{ class: "message" },
        ...{ class: (msg.role) },
    });
    if (msg.role === 'user') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "user-bubble" },
        });
        (msg.content);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "assistant-content" },
        });
        for (const [step, stepIndex] of __VLS_getVForSourceType((msg.steps))) {
            (stepIndex);
            if (step.type === 'thinking') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "thinking-block" },
                    ...{ class: ({
                            streaming: step.isStreaming,
                            collapsed: !step.isStreaming && !step.expanded,
                        }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(msg.role === 'user'))
                                return;
                            if (!(step.type === 'thinking'))
                                return;
                            !step.isStreaming && __VLS_ctx.toggleStepThinkingExpand(step);
                        } },
                    ...{ class: "thinking-header" },
                    ...{ style: {} },
                });
                if (step.isStreaming) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "thinking-icon spinner" },
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                        d: "M21 12a9 9 0 1 1-6.219-8.56",
                    });
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "thinking-icon" },
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                        points: "20 6 9 17 4 12",
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "thinking-label" },
                });
                (step.isStreaming ? '思考中' : '已深度思考');
                if (step.isStreaming && __VLS_ctx.liveThinkingTime > 0) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "thinking-time live" },
                    });
                    (__VLS_ctx.liveThinkingTime);
                }
                else if (step.duration) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "thinking-time" },
                    });
                    (step.duration);
                }
                if (!step.isStreaming) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "chevron" },
                        ...{ class: ({ expanded: step.expanded }) },
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "12",
                        height: "12",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                        points: "6 9 12 15 18 9",
                    });
                }
                if (step.isStreaming) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "thinking-content streaming" },
                        ref: "streamingThinkingRef",
                    });
                    /** @type {typeof __VLS_ctx.streamingThinkingRef} */ ;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "streaming-thinking-text" },
                    });
                    (__VLS_ctx.streamingThinkingBuffer);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "cursor" },
                    });
                }
                else if (step.expanded && step.content) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "thinking-content" },
                    });
                    (step.content);
                }
            }
            else if (step.type === 'tool') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tool-calls-compact" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tool-item" },
                    ...{ class: (step.tool.status) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(msg.role === 'user'))
                                return;
                            if (!!(step.type === 'thinking'))
                                return;
                            if (!(step.type === 'tool'))
                                return;
                            __VLS_ctx.toggleToolExpand(step.tool);
                        } },
                    ...{ class: "tool-row" },
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tool-status-icon" },
                });
                if (step.tool.status === 'running') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "spinner" },
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                        d: "M21 12a9 9 0 1 1-6.219-8.56",
                    });
                }
                else if (step.tool.status === 'success') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                        points: "20 6 9 17 4 12",
                    });
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
                        cx: "12",
                        cy: "12",
                        r: "10",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                        x1: "15",
                        y1: "9",
                        x2: "9",
                        y2: "15",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                        x1: "9",
                        y1: "9",
                        x2: "15",
                        y2: "15",
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "tool-label" },
                });
                (step.tool.name);
                if (step.tool.status === 'error') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-error" },
                    });
                    (__VLS_ctx.getErrorPreview(step.tool.result));
                }
                else if (step.tool.result !== undefined && step.tool.status === 'success') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-preview" },
                    });
                    (__VLS_ctx.getResultPreview(step.tool.result));
                }
                if (step.tool.duration) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-duration" },
                    });
                    (step.tool.duration);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    ...{ class: "chevron" },
                    ...{ class: ({ expanded: step.tool.expanded }) },
                    xmlns: "http://www.w3.org/2000/svg",
                    width: "12",
                    height: "12",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    'stroke-width': "2",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                    points: "6 9 12 15 18 9",
                });
                if (step.tool.expanded) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "tool-details" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "tool-section" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "section-header" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "section-label" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(msg.role === 'user'))
                                    return;
                                if (!!(step.type === 'thinking'))
                                    return;
                                if (!(step.type === 'tool'))
                                    return;
                                if (!(step.tool.expanded))
                                    return;
                                __VLS_ctx.copyToClipboard(__VLS_ctx.formatJson(step.tool.args));
                            } },
                        ...{ class: "copy-btn" },
                        title: "复制参数",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                        ...{ class: "section-content" },
                    });
                    (__VLS_ctx.formatJson(step.tool.args));
                    if (step.tool.result !== undefined) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "tool-section" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "section-header" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "section-label" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(msg.role === 'user'))
                                        return;
                                    if (!!(step.type === 'thinking'))
                                        return;
                                    if (!(step.type === 'tool'))
                                        return;
                                    if (!(step.tool.expanded))
                                        return;
                                    if (!(step.tool.result !== undefined))
                                        return;
                                    __VLS_ctx.copyToClipboard(__VLS_ctx.formatToolResultFull(step.tool.result));
                                } },
                            ...{ class: "copy-btn" },
                            title: "复制结果",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                            ...{ class: "section-content full-result" },
                        });
                        (__VLS_ctx.formatToolResultFull(step.tool.result));
                    }
                }
            }
            else if (step.type === 'todo') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "todo-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(msg.role === 'user'))
                                return;
                            if (!!(step.type === 'thinking'))
                                return;
                            if (!!(step.type === 'tool'))
                                return;
                            if (!(step.type === 'todo'))
                                return;
                            __VLS_ctx.toggleTodoExpand(step.todo);
                        } },
                    ...{ class: "todo-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "todo-icon" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "todo-title" },
                });
                (step.todo.title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "todo-progress" },
                });
                (__VLS_ctx.getTodoProgress(step.todo));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    ...{ class: "chevron" },
                    ...{ class: ({ expanded: step.todo.expanded }) },
                    xmlns: "http://www.w3.org/2000/svg",
                    width: "12",
                    height: "12",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    'stroke-width': "2",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                    points: "6 9 12 15 18 9",
                });
                if (step.todo.expanded) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "todo-items" },
                    });
                    for (const [item] of __VLS_getVForSourceType((step.todo.items))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (item.id),
                            ...{ class: "todo-item" },
                            ...{ class: (item.status) },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "todo-item-status" },
                        });
                        if (item.status === 'completed') {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                                ...{ class: "status-icon completed" },
                                xmlns: "http://www.w3.org/2000/svg",
                                width: "14",
                                height: "14",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                'stroke-width': "2",
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                                points: "20 6 9 17 4 12",
                            });
                        }
                        else if (item.status === 'in_progress') {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                                ...{ class: "status-icon in-progress spinner" },
                                xmlns: "http://www.w3.org/2000/svg",
                                width: "14",
                                height: "14",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                'stroke-width': "2",
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                                d: "M21 12a9 9 0 1 1-6.219-8.56",
                            });
                        }
                        else if (item.status === 'failed') {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                                ...{ class: "status-icon failed" },
                                xmlns: "http://www.w3.org/2000/svg",
                                width: "14",
                                height: "14",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                'stroke-width': "2",
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
                                cx: "12",
                                cy: "12",
                                r: "10",
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                                x1: "15",
                                y1: "9",
                                x2: "9",
                                y2: "15",
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                                x1: "9",
                                y1: "9",
                                x2: "15",
                                y2: "15",
                            });
                        }
                        else {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "status-icon pending" },
                            });
                        }
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "todo-item-content" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "todo-item-text" },
                        });
                        (item.content);
                        if (item.result) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                                ...{ class: "todo-item-result" },
                            });
                            (item.result);
                        }
                    }
                }
            }
        }
        if (msg.role === 'assistant' &&
            msg.status !== 'done' &&
            !msg.isThinkingStream &&
            !__VLS_ctx.isStreamingText(msg)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-spinner" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.getStatusText(msg));
        }
        if (__VLS_ctx.hasToolCalls(msg) && msg.steps.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tool-calls-compact" },
            });
            for (const [tool, ti] of __VLS_getVForSourceType((msg.toolCalls))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (ti),
                    ...{ class: "tool-item" },
                    ...{ class: (tool.status) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(msg.role === 'user'))
                                return;
                            if (!(__VLS_ctx.hasToolCalls(msg) && msg.steps.length === 0))
                                return;
                            __VLS_ctx.toggleToolExpand(tool);
                        } },
                    ...{ class: "tool-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tool-status-icon" },
                });
                if (tool.status === 'running') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "spinner" },
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                        d: "M21 12a9 9 0 1 1-6.219-8.56",
                    });
                }
                else if (tool.status === 'success') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                        points: "20 6 9 17 4 12",
                    });
                }
                else if (tool.status === 'error') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        xmlns: "http://www.w3.org/2000/svg",
                        width: "14",
                        height: "14",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                        x1: "18",
                        y1: "6",
                        x2: "6",
                        y2: "18",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                        x1: "6",
                        y1: "6",
                        x2: "18",
                        y2: "18",
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "tool-label" },
                });
                (tool.name);
                if (tool.status === 'error') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-error" },
                    });
                    (__VLS_ctx.getErrorPreview(tool.result));
                }
                else if (tool.result && tool.status === 'success') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-preview" },
                    });
                    (__VLS_ctx.getResultPreview(tool.result));
                }
                if (tool.duration) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tool-time" },
                    });
                    (tool.duration);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    ...{ class: "tool-chevron" },
                    ...{ class: ({ expanded: tool.expanded }) },
                    xmlns: "http://www.w3.org/2000/svg",
                    width: "12",
                    height: "12",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    'stroke-width': "2",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                    points: "6 9 12 15 18 9",
                });
                if (tool.expanded) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "tool-details" },
                    });
                    if (tool.args && Object.keys(tool.args).length > 0) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "detail-section" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "section-header" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "detail-label" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(msg.role === 'user'))
                                        return;
                                    if (!(__VLS_ctx.hasToolCalls(msg) && msg.steps.length === 0))
                                        return;
                                    if (!(tool.expanded))
                                        return;
                                    if (!(tool.args && Object.keys(tool.args).length > 0))
                                        return;
                                    __VLS_ctx.copyToClipboard(__VLS_ctx.formatJson(tool.args));
                                } },
                            ...{ class: "copy-btn" },
                            title: "复制参数",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                            ...{ class: "detail-code" },
                        });
                        (__VLS_ctx.formatJson(tool.args));
                    }
                    if (tool.result !== undefined) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "detail-section" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "section-header" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "detail-label" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(msg.role === 'user'))
                                        return;
                                    if (!(__VLS_ctx.hasToolCalls(msg) && msg.steps.length === 0))
                                        return;
                                    if (!(tool.expanded))
                                        return;
                                    if (!(tool.result !== undefined))
                                        return;
                                    __VLS_ctx.copyToClipboard(__VLS_ctx.formatToolResultFull(tool.result));
                                } },
                            ...{ class: "copy-btn" },
                            title: "复制结果",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                            ...{ class: "detail-code full-result" },
                        });
                        (__VLS_ctx.formatToolResultFull(tool.result));
                    }
                }
            }
        }
        if (msg.content ||
            (__VLS_ctx.isGenerating && index === __VLS_ctx.messages.length - 1 && msg.status === 'generating')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "assistant-text" },
            });
            if (!__VLS_ctx.isGenerating || index !== __VLS_ctx.messages.length - 1 || msg.status === 'done') {
                /** @type {[typeof MarkdownRenderer, ]} */ ;
                // @ts-ignore
                const __VLS_4 = __VLS_asFunctionalComponent(MarkdownRenderer, new MarkdownRenderer({
                    content: (msg.content),
                }));
                const __VLS_5 = __VLS_4({
                    content: (msg.content),
                }, ...__VLS_functionalComponentArgsRest(__VLS_4));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "streaming-text" },
                });
                (__VLS_ctx.streamingBuffer);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "cursor" },
                });
            }
        }
    }
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bottom-area" },
});
if (__VLS_ctx.activeTodoList) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed-todo-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed-todo-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "fixed-todo-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "fixed-todo-title" },
    });
    (__VLS_ctx.activeTodoList.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "fixed-todo-progress" },
    });
    (__VLS_ctx.getTodoProgress(__VLS_ctx.activeTodoList));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed-todo-items" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeTodoList.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.id),
            ...{ class: "fixed-todo-item" },
            ...{ class: (item.status) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "fixed-todo-status" },
        });
        if (item.status === 'completed') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                ...{ class: "status-icon" },
                width: "10",
                height: "10",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "#10b981",
                'stroke-width': "3",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                points: "20 6 9 17 4 12",
            });
        }
        else if (item.status === 'in_progress') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                ...{ class: "status-icon spinner" },
                width: "10",
                height: "10",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "#3b82f6",
                'stroke-width': "3",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                d: "M21 12a9 9 0 1 1-6.219-8.56",
            });
        }
        else if (item.status === 'failed') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                ...{ class: "status-icon" },
                width: "10",
                height: "10",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "#ef4444",
                'stroke-width': "3",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
                cx: "12",
                cy: "12",
                r: "10",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                x1: "15",
                y1: "9",
                x2: "9",
                y2: "15",
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "pending-dot" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "fixed-todo-text" },
        });
        (item.content);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "input-area" },
});
if (__VLS_ctx.store.availableTools.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tools-selector" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.store.availableTools.length > 0))
                    return;
                __VLS_ctx.showToolsPanel = !__VLS_ctx.showToolsPanel;
            } },
        ...{ class: "tools-trigger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
        d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedToolsLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "chevron" },
        ...{ class: ({ expanded: __VLS_ctx.showToolsPanel }) },
        xmlns: "http://www.w3.org/2000/svg",
        width: "12",
        height: "12",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
        points: "6 9 12 15 18 9",
    });
    if (__VLS_ctx.showToolsPanel) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tools-dropdown" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tools-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.store.availableTools.length > 0))
                        return;
                    if (!(__VLS_ctx.showToolsPanel))
                        return;
                    __VLS_ctx.store.clearSelectedTools();
                } },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.store.availableTools.length > 0))
                        return;
                    if (!(__VLS_ctx.showToolsPanel))
                        return;
                    __VLS_ctx.store.setSelectedTools([]);
                } },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tools-list" },
        });
        for (const [tool] of __VLS_getVForSourceType((__VLS_ctx.store.availableTools))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (tool.name),
                ...{ class: "tool-option" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.store.availableTools.length > 0))
                            return;
                        if (!(__VLS_ctx.showToolsPanel))
                            return;
                        __VLS_ctx.toggleToolSelection(tool.name);
                    } },
                type: "checkbox",
                checked: (__VLS_ctx.isToolSelected(tool.name)),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "tool-name" },
            });
            (tool.name);
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "input-box" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
    ...{ onKeydown: (__VLS_ctx.handleKeydown) },
    ...{ onInput: (__VLS_ctx.autoResize) },
    ref: "inputRef",
    value: (__VLS_ctx.inputMessage),
    placeholder: "发送消息...",
    rows: "1",
    disabled: (!__VLS_ctx.store.isConnected),
});
/** @type {typeof __VLS_ctx.inputRef} */ ;
if (!__VLS_ctx.isGenerating) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.sendMessage) },
        ...{ class: "send-btn" },
        disabled: (!__VLS_ctx.inputMessage.trim() || !__VLS_ctx.store.isConnected),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
        x1: "22",
        y1: "2",
        x2: "11",
        y2: "13",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polygon, __VLS_intrinsicElements.polygon)({
        points: "22 2 15 22 11 13 2 9 22 2",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.stopGeneration) },
        ...{ class: "stop-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "currentColor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect, __VLS_intrinsicElements.rect)({
        x: "6",
        y: "6",
        width: "12",
        height: "12",
        rx: "2",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
if (!__VLS_ctx.store.isConnected) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "error" },
    });
}
else if (__VLS_ctx.store.enabledModels.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "warning" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
if (__VLS_ctx.showDebugPanel) {
    /** @type {[typeof DebugPanel, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(DebugPanel, new DebugPanel({
        ...{ 'onClear': {} },
        logs: (__VLS_ctx.debugLogs),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onClear': {} },
        logs: (__VLS_ctx.debugLogs),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onClear: (__VLS_ctx.clearDebugLogs)
    };
    var __VLS_9;
}
/** @type {__VLS_StyleScopedClasses['chat']} */ ;
/** @type {__VLS_StyleScopedClasses['messages-container']} */ ;
/** @type {__VLS_StyleScopedClasses['messages-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['welcome-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['user-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant-content']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-block']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-header']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-label']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-time']} */ ;
/** @type {__VLS_StyleScopedClasses['live']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-time']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-content']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming-thinking-text']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-calls-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-error']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-duration']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-details']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-label']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-label']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['section-content']} */ ;
/** @type {__VLS_StyleScopedClasses['full-result']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-block']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-header']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-title']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-items']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['in-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['failed']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['pending']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-text']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item-result']} */ ;
/** @type {__VLS_StyleScopedClasses['status-block']} */ ;
/** @type {__VLS_StyleScopedClasses['status-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-calls-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-error']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-time']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-details']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-code']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-code']} */ ;
/** @type {__VLS_StyleScopedClasses['full-result']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant-text']} */ ;
/** @type {__VLS_StyleScopedClasses['streaming-text']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-area']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-header']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-title']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-items']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['status-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['pending-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-todo-text']} */ ;
/** @type {__VLS_StyleScopedClasses['input-area']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-list']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-option']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-name']} */ ;
/** @type {__VLS_StyleScopedClasses['input-box']} */ ;
/** @type {__VLS_StyleScopedClasses['send-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['stop-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['warning']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MarkdownRenderer: MarkdownRenderer,
            DebugPanel: DebugPanel,
            store: store,
            messagesRef: messagesRef,
            inputRef: inputRef,
            streamingThinkingRef: streamingThinkingRef,
            inputMessage: inputMessage,
            isGenerating: isGenerating,
            messages: messages,
            showToolsPanel: showToolsPanel,
            liveThinkingTime: liveThinkingTime,
            streamingBuffer: streamingBuffer,
            streamingThinkingBuffer: streamingThinkingBuffer,
            debugLogs: debugLogs,
            showDebugPanel: showDebugPanel,
            clearDebugLogs: clearDebugLogs,
            hasToolCalls: hasToolCalls,
            isStreamingText: isStreamingText,
            getStatusText: getStatusText,
            toggleToolExpand: toggleToolExpand,
            toggleStepThinkingExpand: toggleStepThinkingExpand,
            toggleTodoExpand: toggleTodoExpand,
            getTodoProgress: getTodoProgress,
            activeTodoList: activeTodoList,
            selectedToolsLabel: selectedToolsLabel,
            isToolSelected: isToolSelected,
            toggleToolSelection: toggleToolSelection,
            autoResize: autoResize,
            handleKeydown: handleKeydown,
            formatJson: formatJson,
            formatToolResultFull: formatToolResultFull,
            copyToClipboard: copyToClipboard,
            getResultPreview: getResultPreview,
            getErrorPreview: getErrorPreview,
            stopGeneration: stopGeneration,
            sendMessage: sendMessage,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

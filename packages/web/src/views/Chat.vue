<template>
    <div class="chat">
        <!-- 消息列表 -->
        <div class="messages-container" ref="messagesRef">
            <div class="messages-wrapper">
                <!-- 欢迎信息 -->
                <div v-if="messages.length === 0 && !isGenerating" class="welcome">
                    <div class="welcome-icon">🔗</div>
                    <h1>MCPLink</h1>
                    <p>开始和 AI 对话，它可以调用工具帮你完成任务</p>
                </div>

                <!-- 消息列表 -->
                <TransitionGroup name="message">
                    <div v-for="(msg, index) in messages" :key="msg.id" class="message" :class="msg.role">
                        <!-- 用户消息 -->
                        <div v-if="msg.role === 'user'" class="user-message-wrapper">
                            <!-- 用户上传的图片 -->
                            <div v-if="msg.images && msg.images.length > 0" class="user-images">
                                <img 
                                    v-for="(img, idx) in msg.images" 
                                    :key="idx" 
                                    :src="img" 
                                    :alt="`用户图片 ${idx + 1}`"
                                    class="user-image"
                                    @click="openImagePreview(img)"
                                />
                            </div>
                            <div class="user-bubble">
                                {{ msg.content }}
                            </div>
                        </div>

                        <!-- AI 消息 -->
                        <div v-else class="assistant-content">
                            <!-- 按 steps 数组顺序渲染执行步骤 -->
                            <template v-for="(step, stepIndex) in msg.steps" :key="stepIndex">
                                <!-- 思考步骤 -->
                                <div
                                    v-if="step.type === 'thinking'"
                                    class="thinking-block"
                                    :class="{
                                        streaming: step.isStreaming,
                                        collapsed: !step.isStreaming && !step.expanded,
                                    }"
                                >
                                    <div
                                        class="thinking-header"
                                        @click.stop="!step.isStreaming && toggleStepThinkingExpand(step)"
                                        style="cursor: pointer"
                                    >
                                        <svg
                                            v-if="step.isStreaming"
                                            class="thinking-icon spinner"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        >
                                            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                        </svg>
                                        <svg
                                            v-else
                                            class="thinking-icon"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        >
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        <span class="thinking-label">{{
                                            step.isStreaming ? '思考中' : '已深度思考'
                                        }}</span>
                                        <span
                                            v-if="step.isStreaming && liveThinkingTime > 0"
                                            class="thinking-time live"
                                            >{{ liveThinkingTime }} 秒</span
                                        >
                                        <span v-else-if="step.duration" class="thinking-time"
                                            >用时 {{ step.duration }} 秒</span
                                        >
                                        <svg
                                            v-if="!step.isStreaming"
                                            class="chevron"
                                            :class="{ expanded: step.expanded }"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        >
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                    <!-- 流式思考内容 -->
                                    <div
                                        v-if="step.isStreaming"
                                        class="thinking-content streaming"
                                        ref="streamingThinkingRef"
                                    >
                                        <span class="streaming-thinking-text">{{ streamingThinkingBuffer }}</span>
                                        <span class="cursor">▊</span>
                                    </div>
                                    <!-- 完成后的思考内容（可折叠） -->
                                    <div v-else-if="step.expanded && step.content" class="thinking-content">
                                        {{ step.content }}
                                    </div>
                                </div>

                                <!-- 工具调用步骤 -->
                                <div v-else-if="step.type === 'tool'" class="tool-calls-compact">
                                    <div class="tool-item" :class="step.tool.status">
                                        <div class="tool-row" @click.stop="toggleToolExpand(step.tool)" style="cursor: pointer">
                                            <!-- 状态图标 -->
                                            <div class="tool-status-icon">
                                                <svg
                                                    v-if="step.tool.status === 'running'"
                                                    class="spinner"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                                </svg>
                                                <svg
                                                    v-else-if="step.tool.status === 'success'"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                                <svg
                                                    v-else
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                                </svg>
                                            </div>
                                            <span class="tool-label">调用 {{ step.tool.name }}</span>
                                            <!-- 错误信息显示 -->
                                            <span
                                                v-if="step.tool.status === 'error'"
                                                class="tool-error"
                                                >❌ 错误：{{ getErrorPreview(step.tool.result) }}</span
                                            >
                                            <!-- 正常结果预览 -->
                                            <span
                                                v-else-if="step.tool.result !== undefined && step.tool.status === 'success'"
                                                class="tool-preview"
                                                >{{ getResultPreview(step.tool.result) }}</span
                                            >
                                            <span v-if="step.tool.duration" class="tool-duration"
                                                >{{ step.tool.duration }}ms</span
                                            >
                                            <svg
                                                class="chevron"
                                                :class="{ expanded: step.tool.expanded }"
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="12"
                                                height="12"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <polyline points="6 9 12 15 18 9"></polyline>
                                            </svg>
                                        </div>
                                        <!-- 展开的详细信息 -->
                                        <div v-if="step.tool.expanded" class="tool-details">
                                            <div class="tool-section">
                                                <div class="section-header">
                                                    <div class="section-label">参数</div>
                                                    <button class="copy-btn" @click.stop="copyToClipboard(formatJson(step.tool.args))" title="复制参数">
                                                        📋 复制
                                                    </button>
                                                </div>
                                                <pre class="section-content">{{ formatJson(step.tool.args) }}</pre>
                                            </div>
                                            <div v-if="step.tool.result !== undefined" class="tool-section">
                                                <div class="section-header">
                                                    <div class="section-label">结果</div>
                                                    <button class="copy-btn" @click.stop="copyToClipboard(formatToolResultFull(step.tool.result))" title="复制结果">
                                                        📋 复制
                                                    </button>
                                                </div>
                                                <pre class="section-content full-result">{{ formatToolResultFull(step.tool.result) }}</pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- TODO 列表步骤 -->
                                <div v-else-if="step.type === 'todo'" class="todo-block">
                                    <div class="todo-header" @click="toggleTodoExpand(step.todo)">
                                        <div class="todo-icon">📋</div>
                                        <span class="todo-title">{{ step.todo.title }}</span>
                                        <span class="todo-progress">
                                            {{ getTodoProgress(step.todo) }}
                                        </span>
                                        <svg
                                            class="chevron"
                                            :class="{ expanded: step.todo.expanded }"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        >
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                    <div v-if="step.todo.expanded" class="todo-items">
                                        <div
                                            v-for="item in step.todo.items"
                                            :key="item.id"
                                            class="todo-item"
                                            :class="item.status"
                                        >
                                            <div class="todo-item-status">
                                                <svg
                                                    v-if="item.status === 'completed'"
                                                    class="status-icon completed"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                                <svg
                                                    v-else-if="item.status === 'in_progress'"
                                                    class="status-icon in-progress spinner"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                                </svg>
                                                <svg
                                                    v-else-if="item.status === 'failed'"
                                                    class="status-icon failed"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                >
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                                </svg>
                                                <div v-else class="status-icon pending"></div>
                                            </div>
                                            <div class="todo-item-content">
                                                <span class="todo-item-text">{{ item.content }}</span>
                                                <span v-if="item.result" class="todo-item-result">{{ item.result }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </template>

                            <!-- 等待状态指示器 -->
                            <div
                                v-if="
                                    msg.role === 'assistant' &&
                                    msg.status !== 'done' &&
                                    !msg.isThinkingStream &&
                                    !isStreamingText(msg)
                                "
                                class="status-block"
                            >
                                <div class="status-spinner"></div>
                                <span>{{ getStatusText(msg) }}</span>
                            </div>

                            <!-- 旧的工具调用列表（用于兼容历史数据） -->
                            <div v-if="hasToolCalls(msg) && msg.steps.length === 0" class="tool-calls-compact">
                                <div
                                    v-for="(tool, ti) in msg.toolCalls"
                                    :key="ti"
                                    class="tool-item"
                                    :class="tool.status"
                                >
                                    <div class="tool-row" @click="toggleToolExpand(tool)">
                                        <!-- 状态图标 -->
                                        <div class="tool-status-icon">
                                            <svg
                                                v-if="tool.status === 'running'"
                                                class="spinner"
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                            </svg>
                                            <svg
                                                v-else-if="tool.status === 'success'"
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            <svg
                                                v-else-if="tool.status === 'error'"
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </div>
                                        <!-- 工具名称 -->
                                        <span class="tool-label">调用 {{ tool.name }}</span>
                                        <!-- 错误信息显示 -->
                                        <span v-if="tool.status === 'error'" class="tool-error">
                                            ❌ 错误：{{ getErrorPreview(tool.result) }}
                                        </span>
                                        <!-- 结果预览 -->
                                        <span v-else-if="tool.result && tool.status === 'success'" class="tool-preview">
                                            {{ getResultPreview(tool.result) }}
                                        </span>
                                        <!-- 耗时 -->
                                        <span v-if="tool.duration" class="tool-time">{{ tool.duration }}ms</span>
                                        <!-- 展开箭头 -->
                                        <svg
                                            class="tool-chevron"
                                            :class="{ expanded: tool.expanded }"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        >
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                    <!-- 展开详情 -->
                                    <div v-if="tool.expanded" class="tool-details">
                                        <div
                                            v-if="tool.args && Object.keys(tool.args).length > 0"
                                            class="detail-section"
                                        >
                                            <div class="section-header">
                                                <div class="detail-label">参数</div>
                                                <button class="copy-btn" @click.stop="copyToClipboard(formatJson(tool.args))" title="复制参数">
                                                    📋 复制
                                                </button>
                                            </div>
                                            <pre class="detail-code">{{ formatJson(tool.args) }}</pre>
                                        </div>
                                        <div v-if="tool.result !== undefined" class="detail-section">
                                            <div class="section-header">
                                                <div class="detail-label">结果</div>
                                                <button class="copy-btn" @click.stop="copyToClipboard(formatToolResultFull(tool.result))" title="复制结果">
                                                    📋 复制
                                                </button>
                                            </div>
                                            <pre class="detail-code full-result">{{ formatToolResultFull(tool.result) }}</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- AI 回复文本 -->
                            <div
                                v-if="
                                    msg.content ||
                                    (isGenerating && index === messages.length - 1 && msg.status === 'generating')
                                "
                                class="assistant-text"
                            >
                                <template
                                    v-if="!isGenerating || index !== messages.length - 1 || msg.status === 'done'"
                                >
                                    <MarkdownRenderer :content="msg.content" />
                                </template>
                                <template v-else>
                                    <span class="streaming-text">{{ streamingBuffer }}</span>
                                    <span class="cursor">▊</span>
                                </template>
                            </div>
                        </div>
                    </div>
                </TransitionGroup>
            </div>
        </div>

        <!-- 底部区域（固定） -->
        <div class="bottom-area">
            <!-- 固定 TODO 面板 - 紧凑风格 -->
            <div v-if="activeTodoList" class="fixed-todo-panel">
                <div class="fixed-todo-header">
                    <span class="fixed-todo-icon">📋</span>
                    <span class="fixed-todo-title">{{ activeTodoList.title }}</span>
                    <span class="fixed-todo-progress">{{ getTodoProgress(activeTodoList) }}</span>
                </div>
                <div class="fixed-todo-items">
                    <div
                        v-for="item in activeTodoList.items"
                        :key="item.id"
                        class="fixed-todo-item"
                        :class="item.status"
                    >
                        <span class="fixed-todo-status">
                            <svg v-if="item.status === 'completed'" class="status-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <svg v-else-if="item.status === 'in_progress'" class="status-icon spinner" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                            <svg v-else-if="item.status === 'failed'" class="status-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line></svg>
                            <span v-else class="pending-dot"></span>
                        </span>
                        <span class="fixed-todo-text">{{ item.content }}</span>
                    </div>
                </div>
            </div>

            <!-- 输入区域 -->
            <div class="input-area">
            <!-- 图片链接输入框 -->
            <div v-if="showImageUrlInput" class="image-url-input-area">
                <div class="image-url-input">
                    <input 
                        type="text" 
                        v-model="imageUrlInput" 
                        placeholder="粘贴图片链接 (https://...)" 
                        @keydown.enter="addImageUrl"
                        @keydown.escape="cancelImageUrl"
                    />
                    <button class="confirm-btn" @click="addImageUrl">确定</button>
                    <button class="cancel-btn" @click="cancelImageUrl">取消</button>
                </div>
            </div>

            <!-- 图片预览区域 -->
            <div v-if="imageUrls.length > 0" class="image-preview-area">
                <div class="image-preview-list">
                    <div v-for="(url, index) in imageUrls" :key="index" class="image-preview-item">
                        <img :src="url" :alt="`图片 ${index + 1}`" @error="(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23888%22>加载失败</text></svg>'" />
                        <button class="remove-image-btn" @click="removeImage(index)" title="移除图片">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 工具选择器 -->
            <div v-if="store.availableTools.length > 0" class="tools-selector">
                <div class="tools-trigger" @click="showToolsPanel = !showToolsPanel">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                        ></path>
                    </svg>
                    <span>{{ selectedToolsLabel }}</span>
                    <svg
                        class="chevron"
                        :class="{ expanded: showToolsPanel }"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>

                <div v-if="showToolsPanel" class="tools-dropdown">
                    <div class="tools-actions">
                        <button @click="store.clearSelectedTools()">全选</button>
                        <button @click="store.setSelectedTools([])">清空</button>
                    </div>
                    <div class="tools-list">
                        <label v-for="tool in store.availableTools" :key="tool.name" class="tool-option">
                            <input
                                type="checkbox"
                                :checked="isToolSelected(tool.name)"
                                @change="toggleToolSelection(tool.name)"
                            />
                            <span class="tool-name">{{ tool.name }}</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="input-box">
                <!-- 图片链接按钮 -->
                <button 
                    class="upload-btn" 
                    @click="triggerImageUpload" 
                    :disabled="!store.isConnected"
                    title="上传图片"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                </button>
                <textarea
                    ref="inputRef"
                    v-model="inputMessage"
                    placeholder="发送消息..."
                    rows="1"
                    @keydown="handleKeydown"
                    @input="autoResize"
                    :disabled="!store.isConnected"
                ></textarea>
                <button
                    v-if="!isGenerating"
                    class="send-btn"
                    :disabled="(!inputMessage.trim() && imageUrls.length === 0) || !store.isConnected"
                    @click="sendMessage"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
                <button v-else class="stop-btn" @click="stopGeneration">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                    </svg>
                </button>
            </div>
                <p class="hint">
                    <span v-if="!store.isConnected" class="error">未连接到服务</span>
                    <span v-else-if="store.enabledModels.length === 0" class="warning">请先添加模型</span>
                    <span v-else>Enter 发送 · Shift+Enter 换行</span>
                </p>
            </div>
        </div>
        
        <!-- 调试面板 -->
        <DebugPanel 
            v-if="showDebugPanel"
            :logs="debugLogs" 
            @clear="clearDebugLogs" 
        />
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, watch, onMounted, onUnmounted, triggerRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/api'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import DebugPanel, { type DebugLog } from '@/components/DebugPanel.vue'

// 工具调用记录
interface ToolCallRecord {
    id: string
    name: string
    args: Record<string, unknown>
    result: unknown
    duration: number
    status: 'running' | 'success' | 'error'
    expanded: boolean
}

// TODO 项类型
interface TodoItemRecord {
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    result?: string
}

// TODO 列表类型
interface TodoListRecord {
    id: string
    title: string
    items: TodoItemRecord[]
    expanded: boolean
}

// 执行步骤类型
type ExecutionStep =
    | {
          type: 'thinking'
          content: string
          duration?: number
          expanded: boolean
          isStreaming: boolean
          startTime?: number
      }
    | {
          type: 'tool'
          tool: ToolCallRecord
      }
    | {
          type: 'todo'
          todo: TodoListRecord
      }

// 消息类型
interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    status?: 'thinking' | 'calling_tool' | 'generating' | 'done'
    // 用户上传的图片（base64 或 URL）
    images?: string[]
    // 执行步骤数组，按顺序存储思考和工具调用
    steps: ExecutionStep[]
    // 保留旧字段用于兼容
    thinking?: string
    thinkingExpanded?: boolean
    isThinkingStream?: boolean
    thinkingStartTime?: number
    thinkingDuration?: number
    toolCalls?: ToolCallRecord[]
    // TODO 列表
    todoList?: TodoListRecord
}

const store = useAppStore()
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const streamingThinkingRef = ref<HTMLElement | null>(null)
const inputMessage = ref('')
const isGenerating = ref(false)

// 图片链接相关
const imageUrls = ref<string[]>([])
const showImageUrlInput = ref(false)
const imageUrlInput = ref('')

// 显示图片链接输入框
function triggerImageUpload() {
    showImageUrlInput.value = true
    // 聚焦输入框
    nextTick(() => {
        const input = document.querySelector('.image-url-input input') as HTMLInputElement
        input?.focus()
    })
}

// 添加图片链接
function addImageUrl() {
    const url = imageUrlInput.value.trim()
    if (!url) return
    
    // 简单验证是否是有效的图片链接
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('请输入有效的图片链接（以 http:// 或 https:// 开头）')
        return
    }
    
    imageUrls.value.push(url)
    imageUrlInput.value = ''
    showImageUrlInput.value = false
}

// 取消添加图片
function cancelImageUrl() {
    imageUrlInput.value = ''
    showImageUrlInput.value = false
}

// 移除图片
function removeImage(index: number) {
    imageUrls.value.splice(index, 1)
}

// 打开图片预览
function openImagePreview(src: string) {
    window.open(src, '_blank')
}
// 使用 shallowRef 配合手动 triggerRef 来确保响应式更新
const messages = shallowRef<ChatMessage[]>([])
const showToolsPanel = ref(false)

// 实时思考计时器
const liveThinkingTime = ref(0)
let thinkingTimerInterval: number | null = null

// 当前请求控制器
let abortController: AbortController | null = null

// 流式文本缓冲（响应式，直接绑定到模板）
const streamingBuffer = ref('')
const streamingThinkingBuffer = ref('')
// 滚动动画帧 ID
let scrollAnimationFrameId: number | null = null
// 活跃超时定时器（用于检测服务端无响应）
let activityTimeoutId: number | null = null
const ACTIVITY_TIMEOUT = 60000 // 60秒无活动超时

// 调试日志
const debugLogs = ref<DebugLog[]>([])
const showDebugPanel = ref(true) // 默认显示调试面板

// 添加调试日志
function addDebugLog(
    type: DebugLog['type'],
    tag: string,
    message: string,
    data?: unknown
) {
    debugLogs.value.push({
        timestamp: Date.now(),
        type,
        tag,
        message,
        data
    })
    // 限制日志数量
    if (debugLogs.value.length > 200) {
        debugLogs.value = debugLogs.value.slice(-150)
    }
}

// 清空调试日志
function clearDebugLogs() {
    debugLogs.value = []
}

// 开始思考计时
function startThinkingTimer() {
    liveThinkingTime.value = 0
    thinkingTimerInterval = window.setInterval(() => {
        liveThinkingTime.value++
    }, 1000)
}

// 停止思考计时
function stopThinkingTimer() {
    if (thinkingTimerInterval) {
        clearInterval(thinkingTimerInterval)
        thinkingTimerInterval = null
    }
}

// 重置活跃超时
function resetActivityTimeout(onTimeout: () => void) {
    if (activityTimeoutId) {
        clearTimeout(activityTimeoutId)
    }
    activityTimeoutId = window.setTimeout(() => {
        console.warn('[Chat] Activity timeout - no response from server')
        onTimeout()
    }, ACTIVITY_TIMEOUT)
}

// 清除活跃超时
function clearActivityTimeout() {
    if (activityTimeoutId) {
        clearTimeout(activityTimeoutId)
        activityTimeoutId = null
    }
}

// 检查消息是否有工具调用
function hasToolCalls(msg: ChatMessage): boolean {
    return !!(msg.toolCalls && msg.toolCalls.length > 0)
}

// 检查消息是否正在流式输出文本
function isStreamingText(msg: ChatMessage): boolean {
    return msg.status === 'generating' && streamingBuffer.value.length > 0
}

// 获取状态显示文本
function getStatusText(msg: ChatMessage): string {
    switch (msg.status) {
        case 'thinking':
            return '正在思考...'
        case 'calling_tool':
            return '正在调用工具...'
        case 'generating':
            return '正在生成...'
        default:
            return '处理中...'
    }
}

// 强制触发消息列表更新
function forceUpdate() {
    triggerRef(messages)
}

// 切换工具展开状态
function toggleToolExpand(tool: ToolCallRecord | undefined) {
    if (!tool) return
    tool.expanded = !tool.expanded
    messages.value = [...messages.value]
}

// 切换思考过程展开状态
function toggleThinkingExpand(msg: ChatMessage) {
    msg.thinkingExpanded = !msg.thinkingExpanded
    messages.value = [...messages.value]
}

// 切换步骤中的思考展开状态
function toggleStepThinkingExpand(step: ExecutionStep | undefined) {
    if (!step) return
    if (step.type === 'thinking') {
        step.expanded = !step.expanded
        messages.value = [...messages.value]
    }
}

// 切换 TODO 展开状态
function toggleTodoExpand(todo: TodoListRecord | undefined) {
    if (!todo) return
    todo.expanded = !todo.expanded
    messages.value = [...messages.value]
}

// 获取 TODO 进度文本
function getTodoProgress(todo: TodoListRecord): string {
    const completed = todo.items.filter((i) => i.status === 'completed').length
    const total = todo.items.length
    return `${completed}/${total}`
}

// 获取当前活动的 TODO 列表（从最后一个 AI 消息中）
const activeTodoList = computed(() => {
    // 从后往前找第一个有 todoList 的 AI 消息
    for (let i = messages.value.length - 1; i >= 0; i--) {
        const msg = messages.value[i]
        if (msg.role === 'assistant' && msg.todoList && msg.todoList.items.length > 0) {
            // 检查是否有未完成的项目
            const hasIncomplete = msg.todoList.items.some(
                (item) => item.status === 'pending' || item.status === 'in_progress'
            )
            // 只有在正在生成或有未完成项时才显示
            if (isGenerating.value || hasIncomplete) {
                return msg.todoList
            }
        }
    }
    return null
})

// 工具选择相关
const selectedToolsLabel = computed(() => {
    if (store.selectedToolNames.length === 0) {
        return `全部工具 (${store.availableTools.length})`
    }
    if (store.selectedToolNames.length === 1) {
        return store.selectedToolNames[0]
    }
    return `${store.selectedToolNames.length} 个工具`
})

function isToolSelected(toolName: string) {
    if (store.selectedToolNames.length === 0) return true
    return store.selectedToolNames.includes(toolName)
}

function toggleToolSelection(toolName: string) {
    const currentSelected =
        store.selectedToolNames.length === 0 ? store.availableTools.map((t) => t.name) : [...store.selectedToolNames]

    const index = currentSelected.indexOf(toolName)
    if (index === -1) {
        currentSelected.push(toolName)
    } else {
        currentSelected.splice(index, 1)
    }

    if (currentSelected.length === store.availableTools.length) {
        store.setSelectedTools([])
    } else {
        store.setSelectedTools(currentSelected)
    }
}

// 监听会话切换
watch(
    () => store.currentConversationId,
    async (id) => {
        if (id) {
            const conv = store.conversations.find((c) => c.id === id)
            if (conv) {
                messages.value = conv.messages.map((m, i) => {
                    // 构建 steps 数组
                    const steps: ExecutionStep[] = []

                    // 优先从保存的 steps 数据恢复
                    const savedSteps = (m as any).steps
                    if (savedSteps && Array.isArray(savedSteps) && savedSteps.length > 0) {
                        for (let si = 0; si < savedSteps.length; si++) {
                            const s = savedSteps[si]
                            if (s.type === 'thinking') {
                                steps.push({
                                    type: 'thinking',
                                    content: s.content || '',
                                    duration: s.duration,
                                    expanded: false,
                                    isStreaming: false,
                                })
                            } else if (s.type === 'tool') {
                                steps.push({
                                    type: 'tool',
                                    tool: {
                                        id: `tool-${i}-${si}`,
                                        name: s.name,
                                        args: s.args || s.arguments || {},
                                        result: s.result,
                                        duration: s.duration,
                                        status: (s.status === 'error' ? 'error' : 'success') as
                                            | 'success'
                                            | 'error',
                                        expanded: false,
                                    },
                                })
                            }
                        }
                    } else {
                        // 兼容旧数据：从 thinking 和 toolCalls 构建
                        if (m.thinking) {
                            steps.push({
                                type: 'thinking',
                                content: m.thinking,
                                duration: m.thinkingDuration,
                                expanded: false,
                                isStreaming: false,
                            })
                        }
                        if (m.toolCalls) {
                            for (let ti = 0; ti < m.toolCalls.length; ti++) {
                                const tc = m.toolCalls[ti]
                                steps.push({
                                    type: 'tool',
                                    tool: {
                                        id: `tool-${i}-${ti}`,
                                        name: tc.name,
                                        args: tc.arguments,
                                        result: tc.result,
                                        duration: tc.duration,
                                        status: (tc.status === 'error' ? 'error' : 'success') as
                                            | 'success'
                                            | 'error',
                                        expanded: false,
                                    },
                                })
                            }
                        }
                    }

                    return {
                        id: `msg-${i}`,
                        role: m.role,
                        content: m.content,
                        timestamp: m.timestamp,
                        status: 'done' as const,
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
                            status: (tc.status === 'error' ? 'error' : 'success') as 'success' | 'error',
                            expanded: false,
                        })),
                    }
                })
                scrollToBottom()
            }
        } else {
            messages.value = []
        }
    },
    { immediate: true }
)

// 滚动到底部
function scrollToBottom() {
    requestAnimationFrame(() => {
        if (messagesRef.value) {
            messagesRef.value.scrollTop = messagesRef.value.scrollHeight
        }
    })
}

// 自动调整输入框高度
function autoResize() {
    if (inputRef.value) {
        inputRef.value.style.height = 'auto'
        inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 150) + 'px'
    }
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isGenerating.value) {
            sendMessage()
        }
    }
}

// 格式化 JSON
function formatJson(obj: unknown): string {
    try {
        return JSON.stringify(obj, null, 2)
    } catch {
        return String(obj)
    }
}

// 格式化工具结果（完整版，不截断）
function formatToolResultFull(result: unknown): string {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result)
            return JSON.stringify(parsed, null, 2)
        } catch {
            return result
        }
    }
    return formatJson(result)
}

// 格式化工具结果（用于预览，可能截断）
function formatToolResult(result: unknown): string {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result)
            return JSON.stringify(parsed, null, 2)
        } catch {
            return result.length > 1000 ? result.slice(0, 1000) + '...' : result
        }
    }
    return formatJson(result)
}

// 复制到剪贴板
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
        // 简单提示
        const msg = document.createElement('div')
        msg.textContent = '已复制到剪贴板'
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
        `
        document.body.appendChild(msg)
        setTimeout(() => msg.remove(), 1500)
    }).catch(() => {
        // 备用方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
    })
}

// 解析内容中的 <think> 标签（备用方案）
function parseThinkTags(content: string): { thinking: string; text: string } {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi
    let thinking = ''
    let text = content

    // 提取所有 <think> 标签内容
    let match
    while ((match = thinkRegex.exec(content)) !== null) {
        thinking += (thinking ? '\n\n' : '') + match[1].trim()
    }

    // 移除 <think> 标签
    text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    return { thinking, text }
}

// 格式化工具结果
function formatResult(result: unknown): string {
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result)
            return JSON.stringify(parsed, null, 2)
        } catch {
            return result.length > 1000 ? result.slice(0, 1000) + '...' : result
        }
    }
    return formatJson(result)
}

// 获取结果预览
function getResultPreview(result: unknown): string {
    let text = ''
    if (typeof result === 'string') {
        text = result
    } else {
        text = JSON.stringify(result)
    }
    text = text.replace(/[\n\r]+/g, ' ').trim()
    return text.length > 50 ? text.slice(0, 50) + '...' : text
}

// 获取错误预览
function getErrorPreview(result: unknown): string {
    let text = ''
    if (typeof result === 'string') {
        text = result
    } else if (result && typeof result === 'object') {
        // 尝试提取错误消息
        const obj = result as Record<string, unknown>
        text = (obj.message as string) || (obj.error as string) || JSON.stringify(result)
    } else {
        text = String(result)
    }
    text = text.replace(/[\n\r]+/g, ' ').trim()
    return text.length > 80 ? text.slice(0, 80) + '...' : text
}

// 节流滚动到底部
function throttledScroll() {
    if (!scrollAnimationFrameId) {
        scrollAnimationFrameId = requestAnimationFrame(() => {
            // 滚动思考内容区域
            if (streamingThinkingRef.value) {
                streamingThinkingRef.value.scrollTop = streamingThinkingRef.value.scrollHeight
            }
            // 滚动消息区域
            scrollToBottom()
            scrollAnimationFrameId = null
        })
    }
}

// 追加流式文本（响应式，即时更新）
function appendStreamingText(text: string) {
    streamingBuffer.value += text
    throttledScroll()
}

// 追加流式思考（响应式，即时更新）
function appendStreamingThinking(text: string) {
    streamingThinkingBuffer.value += text
    throttledScroll()
}

// 停止生成
function stopGeneration() {
    if (abortController) {
        abortController.abort()
        abortController = null
    }

    clearActivityTimeout()
    stopThinkingTimer()

    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
        // 保存流式思考内容
        if (lastMsg.isThinkingStream && streamingThinkingBuffer.value) {
            lastMsg.thinking = streamingThinkingBuffer.value
            lastMsg.isThinkingStream = false
            if (lastMsg.thinkingStartTime) {
                lastMsg.thinkingDuration = Math.round((Date.now() - lastMsg.thinkingStartTime) / 1000)
            }
        }
        lastMsg.content = streamingBuffer.value || lastMsg.content
        lastMsg.status = 'done'
        forceUpdate()
    }

    isGenerating.value = false
    streamingBuffer.value = ''
    streamingThinkingBuffer.value = ''
}

// 发送消息
async function sendMessage() {
    const message = inputMessage.value.trim()
    const hasImages = imageUrls.value.length > 0
    
    // 必须有文字或图片
    if (!message && !hasImages) return
    if (isGenerating.value) return

    // 收集图片链接
    const imagesToSend = [...imageUrls.value]

    addDebugLog('request', 'SEND', `发送消息: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`, {
        fullMessage: message,
        imageCount: imagesToSend.length,
        modelId: store.currentModelId,
        conversationId: store.currentConversationId,
        isGenerating: isGenerating.value
    })

    inputMessage.value = ''
    imageUrls.value = []  // 清空已选图片
    if (inputRef.value) {
        inputRef.value.style.height = 'auto'
    }

    if (!store.currentConversationId) {
        addDebugLog('info', 'INIT', '创建新会话')
        await store.createConversation()
        addDebugLog('success', 'INIT', `会话已创建: ${store.currentConversationId}`)
    }

    // 添加用户消息
    const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: message || '(发送了图片)',
        timestamp: Date.now(),
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
        steps: [],
    }

    // 准备 AI 消息
    const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'thinking',
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        steps: [],
    }

    // 更新消息列表
    messages.value = [...messages.value, userMsg, aiMsg]
    scrollToBottom()

    isGenerating.value = true
    streamingBuffer.value = ''
    streamingThinkingBuffer.value = ''
    showToolsPanel.value = false

    await nextTick()
    scrollToBottom()

    const selectedTools = store.selectedToolNames.length > 0 ? store.selectedToolNames : undefined
    const toolCallMap = new Map<string, ToolCallRecord>()

    // 获取 aiMsg 的引用（用于更新）
    const getAiMsg = () => messages.value[messages.value.length - 1] as ChatMessage

    // 超时处理函数
    const handleTimeout = () => {
        addDebugLog('error', 'TIMEOUT', `请求超时 (${ACTIVITY_TIMEOUT / 1000}秒无响应)`, {
            streamingBufferLength: streamingBuffer.value.length,
            streamingThinkingLength: streamingThinkingBuffer.value.length
        })
        
        const aiMsg = getAiMsg()
        stopThinkingTimer()
        clearActivityTimeout()
        
        // 更新正在运行的工具为超时状态
        aiMsg.steps.forEach((step) => {
            if (step.type === 'tool' && step.tool.status === 'running') {
                step.tool.status = 'error'
                step.tool.result = '请求超时，服务端无响应'
            }
        })
        
        // 如果有流式内容，保存它
        if (streamingBuffer.value) {
            aiMsg.content = streamingBuffer.value
        } else if (!aiMsg.content) {
            aiMsg.content = '请求超时，服务端无响应。请检查网络连接或重试。'
        }
        
        aiMsg.status = 'done'
        forceUpdate()
        isGenerating.value = false
        streamingBuffer.value = ''
        streamingThinkingBuffer.value = ''
        
        if (abortController) {
            abortController.abort()
            abortController = null
        }
    }
    
    // 启动初始活跃超时
    resetActivityTimeout(handleTimeout)
    
    addDebugLog('request', 'API', '开始 SSE 请求', {
        url: `${api.getBaseUrl()}/api/chat`,
        modelId: store.currentModelId,
        conversationId: store.currentConversationId,
        tools: selectedTools,
        imagesCount: imagesToSend.length,
        images: imagesToSend
    })

    abortController = api.chat(message || '', {
        modelId: store.currentModelId || undefined,
        conversationId: store.currentConversationId || undefined,
        tools: selectedTools,
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
        onEvent: (event) => {
            const aiMsg = getAiMsg()
            
            // 收到任何事件都重置超时
            resetActivityTimeout(handleTimeout)
            
            // 记录所有事件
            addDebugLog('event', 'SSE', `收到事件: ${event.type}`, event.data)

            switch (event.type) {
                case 'connected':
                    console.log('[SSE] Connected')
                    addDebugLog('success', 'SSE', '连接已建立')
                    break

                case 'iteration_start':
                    console.log('[SSE] Iteration start:', event.data.iteration)
                    aiMsg.status = 'thinking'
                    forceUpdate()
                    scrollToBottom()
                    break

                case 'thinking_start': {
                    // 开始流式思考 - 创建新的思考步骤
                    console.log('[SSE] Thinking start')
                    const thinkStep: ExecutionStep = {
                        type: 'thinking',
                        content: '',
                        expanded: true, // 流式时展开
                        isStreaming: true,
                        startTime: Date.now(),
                    }
                    aiMsg.steps.push(thinkStep)
                    aiMsg.isThinkingStream = true
                    streamingThinkingBuffer.value = ''
                    startThinkingTimer()
                    forceUpdate()
                    break
                }

                case 'thinking_delta':
                    // 流式思考内容 - 更新当前思考步骤
                    if (event.data.content) {
                        appendStreamingThinking(event.data.content)
                    }
                    break

                case 'thinking_end': {
                    // 思考结束，完成当前思考步骤
                    console.log('[SSE] Thinking end')
                    stopThinkingTimer()
                    // 找到最后一个思考步骤并更新
                    const lastThinkStep = [...aiMsg.steps].reverse().find((s) => s.type === 'thinking')
                    if (lastThinkStep && lastThinkStep.type === 'thinking') {
                        lastThinkStep.content = streamingThinkingBuffer.value
                        lastThinkStep.isStreaming = false
                        lastThinkStep.expanded = false // 自动折叠
                        if (lastThinkStep.startTime) {
                            lastThinkStep.duration = Math.round((Date.now() - lastThinkStep.startTime) / 1000)
                        }
                    }
                    aiMsg.isThinkingStream = false
                    aiMsg.status = 'calling_tool' // 思考结束后，显示"正在调用工具"状态
                    streamingThinkingBuffer.value = ''
                    forceUpdate()
                    scrollToBottom()
                    break
                }

                case 'thinking_content':
                    // 非流式思考内容（用于工具调用时的中间思考）
                    console.log('[SSE] Thinking content')
                    if (event.data.content) {
                        aiMsg.thinking = (aiMsg.thinking || '') + event.data.content
                        forceUpdate()
                    }
                    break

                case 'text_start':
                    console.log('[SSE] Text start')
                    aiMsg.status = 'generating'
                    forceUpdate()
                    break

                case 'text_delta':
                    if (event.data.content) {
                        appendStreamingText(event.data.content)
                    }
                    break

                case 'text_end':
                    console.log('[SSE] Text end')
                    break

                case 'tool_call_start': {
                    console.log('[SSE] Tool call start:', event.data.toolName, 'toolCallId:', event.data.toolCallId)
                    aiMsg.status = 'calling_tool'
                    const toolCall: ToolCallRecord = {
                        id: event.data.toolCallId || `tool-${Date.now()}`,
                        name: event.data.toolName || '',
                        args: event.data.toolArgs || {},
                        result: undefined,
                        duration: 0,
                        status: 'running',
                        expanded: false,
                    }
                    if (!aiMsg.toolCalls) aiMsg.toolCalls = []
                    aiMsg.toolCalls.push(toolCall)
                    toolCallMap.set(toolCall.id, toolCall)
                    // 添加到 steps 数组
                    aiMsg.steps.push({ type: 'tool', tool: toolCall })
                    forceUpdate()
                    scrollToBottom()
                    break
                }

                case 'tool_executing': {
                    console.log('[SSE] Tool executing:', event.data.toolName)
                    const tool = toolCallMap.get(event.data.toolCallId || '')
                    if (tool) {
                        tool.status = 'running'
                        if (event.data.toolArgs) {
                            tool.args = event.data.toolArgs
                        }
                        forceUpdate()
                    }
                    break
                }

                case 'tool_result': {
                    const resultToolCallId = event.data.toolCallId || ''
                    console.log('[SSE] Tool result:', event.data.toolName, 'toolCallId:', resultToolCallId, 'duration:', event.data.duration, 'ms')
                    console.log('[SSE] toolCallMap keys:', Array.from(toolCallMap.keys()))
                    console.log('[SSE] aiMsg.toolCalls:', aiMsg.toolCalls?.map(t => ({ id: t.id, name: t.name, status: t.status })))
                    
                    let tool = toolCallMap.get(resultToolCallId)
                    
                    // Fallback 1: 如果通过 ID 找不到，按工具名称查找最近的未完成工具
                    if (!tool && event.data.toolName && aiMsg.toolCalls) {
                        console.log('[SSE] Tool not found by ID, searching by name:', event.data.toolName)
                        tool = aiMsg.toolCalls.find(
                            (t) => t.name === event.data.toolName && t.status === 'running'
                        )
                    }
                    
                    // Fallback 2: 如果还是找不到，查找任何同名工具（可能状态已被改变）
                    if (!tool && event.data.toolName && aiMsg.toolCalls) {
                        console.log('[SSE] Fallback 2: searching any tool with name:', event.data.toolName)
                        tool = aiMsg.toolCalls.find(
                            (t) => t.name === event.data.toolName && !t.result
                        )
                    }
                    
                    // Fallback 3: 直接从 steps 中查找
                    if (!tool && event.data.toolName && aiMsg.steps) {
                        console.log('[SSE] Fallback 3: searching in steps')
                        const toolStep = aiMsg.steps.find(
                            (s) => s.type === 'tool' && s.tool.name === event.data.toolName && !s.tool.result
                        )
                        if (toolStep && toolStep.type === 'tool') {
                            tool = toolStep.tool
                        }
                    }
                    
                    if (tool) {
                        tool.result = event.data.toolResult
                        tool.duration = event.data.duration || 0
                        tool.status = event.data.isError ? 'error' : 'success'
                        console.log('[SSE] Tool status updated to:', tool.status, 'result length:', String(event.data.toolResult || '').length)
                        forceUpdate()
                    } else {
                        console.error('[SSE] ❌ Tool not found for result:', event.data.toolName, resultToolCallId)
                        console.error('[SSE] Available tools:', aiMsg.toolCalls)
                        console.error('[SSE] Available steps:', aiMsg.steps?.filter(s => s.type === 'tool'))
                    }
                    scrollToBottom()
                    break
                }

                case 'iteration_end':
                    console.log('[SSE] Iteration end:', event.data.iteration)
                    break

                case 'todo_start': {
                    console.log('[SSE] TODO start:', event.data.todoTitle)
                    const todoStep: ExecutionStep = {
                        type: 'todo',
                        todo: {
                            id: event.data.todoId || `todo-${Date.now()}`,
                            title: event.data.todoTitle || '任务规划',
                            items: [],
                            expanded: true,
                        },
                    }
                    aiMsg.steps.push(todoStep)
                    aiMsg.todoList = todoStep.todo
                    forceUpdate()
                    scrollToBottom()
                    break
                }

                case 'todo_item_add': {
                    console.log('[SSE] TODO item add:', event.data.todoItemContent)
                    if (aiMsg.todoList) {
                        aiMsg.todoList.items.push({
                            id: event.data.todoItemId || `item-${Date.now()}`,
                            content: event.data.todoItemContent || '',
                            status: event.data.todoItemStatus || 'pending',
                        })
                        forceUpdate()
                        scrollToBottom()
                    }
                    break
                }

                case 'todo_item_update': {
                    console.log('[SSE] TODO item update:', event.data.todoItemId, event.data.todoItemStatus)
                    if (aiMsg.todoList) {
                        const item = aiMsg.todoList.items.find((i) => i.id === event.data.todoItemId)
                        if (item) {
                            item.status = event.data.todoItemStatus || item.status
                            if (event.data.todoItemResult) {
                                item.result = event.data.todoItemResult
                            }
                            forceUpdate()
                        }
                    }
                    break
                }

                case 'todo_end':
                    console.log('[SSE] TODO end')
                    break

                case 'error':
                    console.error('[SSE] Error:', event.data.error)
                    addDebugLog('error', 'SSE', `服务端错误: ${event.data.error}`, event.data)
                    clearActivityTimeout()
                    stopThinkingTimer()
                    
                    // 更新正在运行的工具为错误状态
                    aiMsg.steps.forEach((step) => {
                        if (step.type === 'tool' && step.tool.status === 'running') {
                            step.tool.status = 'error'
                            step.tool.result = event.data.error || '未知错误'
                        }
                    })
                    
                    // 如果有部分内容，保存它
                    if (streamingBuffer.value) {
                        aiMsg.content = streamingBuffer.value + `\n\n⚠️ 发生错误: ${event.data.error}`
                    } else {
                        aiMsg.content = `❌ 错误: ${event.data.error}`
                    }
                    aiMsg.status = 'done'
                    forceUpdate()
                    isGenerating.value = false
                    streamingBuffer.value = ''
                    streamingThinkingBuffer.value = ''
                    break

                case 'complete':
                    console.log('[SSE] Complete')
                    addDebugLog('success', 'SSE', '流式响应完成', event.data)
                    break
            }
        },
        onError: (error) => {
            console.error('Chat error:', error)
            addDebugLog('error', 'FETCH', `请求错误: ${error.message}`, {
                name: error.name,
                message: error.message,
                stack: error.stack
            })
            clearActivityTimeout()
            stopThinkingTimer()
            
            const aiMsg = getAiMsg()
            if (error.name !== 'AbortError') {
                // 更新正在运行的工具为错误状态
                aiMsg.steps.forEach((step) => {
                    if (step.type === 'tool' && step.tool.status === 'running') {
                        step.tool.status = 'error'
                        step.tool.result = error.message || '请求失败'
                    }
                })
                
                // 如果有部分内容，保存它
                if (streamingBuffer.value) {
                    aiMsg.content = streamingBuffer.value + `\n\n⚠️ 请求失败: ${error.message}`
                } else {
                    aiMsg.content = `❌ 请求失败: ${error.message}`
                }
                aiMsg.status = 'done'
                forceUpdate()
            } else {
                addDebugLog('warn', 'ABORT', '请求被用户取消')
            }
            isGenerating.value = false
            streamingBuffer.value = ''
            streamingThinkingBuffer.value = ''
        },
        onComplete: async () => {
            console.log('[SSE] onComplete called')
            addDebugLog('success', 'COMPLETE', 'SSE 流已结束', {
                streamingBufferLength: streamingBuffer.value.length,
                stepsCount: getAiMsg().steps.length
            })
            clearActivityTimeout()
            stopThinkingTimer()
            const aiMsg = getAiMsg()

            // 解析内容中可能残留的 <think> 标签
            const rawContent = streamingBuffer.value
            const { thinking: parsedThinking, text: cleanText } = parseThinkTags(rawContent)

            // 如果解析出思考内容，合并到已有的思考过程中
            if (parsedThinking) {
                aiMsg.thinking = (aiMsg.thinking ? aiMsg.thinking + '\n\n' : '') + parsedThinking
                aiMsg.content = cleanText
                // 如果之前没有思考时间，设置一个
                if (!aiMsg.thinkingDuration && aiMsg.thinkingStartTime) {
                    aiMsg.thinkingDuration = Math.round((Date.now() - aiMsg.thinkingStartTime) / 1000)
                }
            } else {
                aiMsg.content = rawContent
            }

            aiMsg.status = 'done'
            aiMsg.isThinkingStream = false
            forceUpdate()

            isGenerating.value = false
            streamingBuffer.value = ''
            abortController = null

            await saveConversation()

            if (messages.value.length === 2 && store.currentConversationId) {
                generateTitle(userMsg.content, aiMsg.content)
            }
        },
    })
}

// 保存会话
async function saveConversation() {
    if (store.currentConversationId) {
        const storedMessages = messages.value.map((m) => {
            // 从 steps 中提取思考内容（合并所有思考步骤）
            const thinkingFromSteps = m.steps
                ?.filter((s) => s.type === 'thinking')
                .map((s) => (s as { type: 'thinking'; content: string }).content)
                .join('\n\n')

            // 从 steps 中提取工具调用
            const toolCallsFromSteps = m.steps
                ?.filter((s) => s.type === 'tool')
                .map((s) => {
                    const tool = (s as { type: 'tool'; tool: ToolCallRecord }).tool
                    // 将内部 status 转换为 API 兼容的 status
                    const apiStatus = tool.status === 'running' ? 'executing' : tool.status
                    return {
                        name: tool.name,
                        arguments: tool.args,
                        result: tool.result,
                        duration: tool.duration,
                        status: apiStatus as 'pending' | 'executing' | 'success' | 'error',
                    }
                })

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
                            type: 'thinking' as const,
                            content: s.content,
                            duration: s.duration,
                        }
                    } else if (s.type === 'tool') {
                        return {
                            type: 'tool' as const,
                            name: s.tool.name,
                            args: s.tool.args,
                            result: s.tool.result,
                            duration: s.tool.duration,
                            status: s.tool.status,
                        }
                    } else {
                        // todo type
                        return {
                            type: 'thinking' as const,
                            content: `TODO: ${s.todo.title || '任务'}`,
                            duration: 0,
                        }
                    }
                }),
                toolCalls:
                    toolCallsFromSteps ||
                    m.toolCalls?.map((tc) => {
                        const apiStatus = tc.status === 'running' ? 'executing' : tc.status
                        return {
                            name: tc.name,
                            arguments: tc.args,
                            result: tc.result,
                            duration: tc.duration,
                            status: apiStatus as 'pending' | 'executing' | 'success' | 'error',
                        }
                    }),
            }
        })
        await api.updateConversation(store.currentConversationId, {
            messages: storedMessages,
        })
    }
}

// 生成对话标题
async function generateTitle(userMessage: string, assistantMessage: string) {
    if (!store.currentConversationId) return

    try {
        const { title } = await api.generateConversationTitle(
            store.currentConversationId,
            userMessage,
            assistantMessage
        )
        store.updateConversationTitle(store.currentConversationId, title)
    } catch (error) {
        console.error('Failed to generate title:', error)
    }
}

onMounted(() => {
    inputRef.value?.focus()
})

onUnmounted(() => {
    if (abortController) {
        abortController.abort()
    }
    if (scrollAnimationFrameId) {
        cancelAnimationFrame(scrollAnimationFrameId)
    }
    clearActivityTimeout()
    stopThinkingTimer()
})
</script>

<style scoped>
.chat {
    display: flex;
    flex-direction: column;
    height: 100%;
}

/* 消息区域 */
.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px 0;
}

.messages-wrapper {
    max-width: var(--max-chat-width);
    margin: 0 auto;
    padding: 0 16px;
}

/* 欢迎信息 */
.welcome {
    text-align: center;
    padding: 60px 20px;
    animation: fadeIn 0.4s ease;
}

.welcome-icon {
    font-size: 48px;
    margin-bottom: 12px;
}

.welcome h1 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--text-primary);
}

.welcome p {
    color: var(--text-secondary);
    font-size: 14px;
}

/* 消息动画 */
.message-enter-active {
    animation: messageIn 0.25s ease;
}

@keyframes messageIn {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

/* 消息 */
.message {
    margin-bottom: 16px;
}

.message.user {
    display: flex;
    justify-content: flex-end;
}

.user-bubble {
    max-width: 75%;
    background: var(--accent-color);
    color: white;
    padding: 10px 14px;
    border-radius: 16px 16px 4px 16px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}

.assistant-content {
    width: 100%;
}

/* 状态块 - 思考中 */
.status-block {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.status-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

/* 思考过程 */
.thinking-block {
    margin-bottom: 8px;
    background: transparent;
    border-radius: 6px;
    overflow: hidden;
    font-size: 13px;
}

.thinking-block.collapsed {
    background: transparent;
}

.thinking-block.streaming {
    background: var(--bg-tertiary);
}

.thinking-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: color 0.15s;
    font-size: 12px;
}

.thinking-block.streaming .thinking-header {
    padding: 6px 10px;
    cursor: default;
}

.thinking-header:hover {
    color: var(--text-secondary);
}

.thinking-block.streaming .thinking-header:hover {
    color: var(--text-tertiary);
}

.thinking-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
    width: 14px;
    height: 14px;
}

.thinking-block.streaming .thinking-icon {
    color: var(--accent-color);
}

.thinking-block:not(.streaming) .thinking-icon {
    color: var(--accent-color);
}

.thinking-label {
    font-style: italic;
    opacity: 0.8;
}

.thinking-time {
    color: var(--text-tertiary);
    font-size: 11px;
    font-style: italic;
}

.thinking-time.live {
    color: var(--accent-color);
}

.thinking-header .chevron {
    margin-left: 2px;
    transition: transform 0.2s;
    color: var(--text-tertiary);
    opacity: 0.6;
}

.thinking-header .chevron.expanded {
    transform: rotate(180deg);
}

.thinking-content {
    padding: 8px 10px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    background: var(--bg-tertiary);
    border-radius: 6px;
    max-height: 300px;
    overflow-y: auto;
    margin-top: 4px;
}

.thinking-content.streaming {
    margin-top: 0;
    border-radius: 0 0 6px 6px;
}

.streaming-thinking-text {
    white-space: pre-wrap;
}

/* 工具调用 - 紧凑设计 */
.tool-calls-compact {
    margin-bottom: 10px;
}

.tool-item {
    background: var(--bg-tertiary);
    border-radius: 6px;
    margin-bottom: 4px;
    overflow: hidden;
    border-left: 2px solid var(--border-color);
    transition: all 0.15s;
}

.tool-item.running {
    border-left-color: var(--warning-color);
}

.tool-item.success {
    border-left-color: var(--success-color);
}

.tool-item.error {
    border-left-color: var(--error-color);
}

.tool-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 13px;
}

.tool-row:hover {
    background: var(--bg-hover);
}

.tool-status-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.tool-item.running .tool-status-icon {
    color: var(--warning-color);
}

.tool-item.success .tool-status-icon {
    color: var(--success-color);
}

.tool-item.error .tool-status-icon {
    color: var(--error-color);
}

.tool-label {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
}

.tool-preview {
    flex: 1;
    min-width: 0;
    color: var(--text-tertiary);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tool-error {
    flex: 1;
    min-width: 0;
    color: var(--error-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}

.tool-time {
    font-size: 11px;
    color: var(--text-tertiary);
    flex-shrink: 0;
}

.tool-chevron {
    color: var(--text-tertiary);
    transition: transform 0.2s;
    flex-shrink: 0;
}

.tool-chevron.expanded {
    transform: rotate(180deg);
}

/* 工具详情 */
.tool-details {
    padding: 10px 12px;
    border-top: 1px solid var(--border-color);
    animation: expandIn 0.2s ease;
    background: var(--bg-primary);
}

@keyframes expandIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

.tool-section {
    margin-bottom: 12px;
}

.tool-section:last-child {
    margin-bottom: 0;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.copy-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.copy-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--accent-color);
}

.section-content {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 10px 12px;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    max-height: 400px;
    overflow-y: auto;
}

.section-content.full-result {
    max-height: 500px;
}

/* 复制成功动画 */
@keyframes fadeInOut {
    0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
    20% { opacity: 1; transform: translateX(-50%) translateY(0); }
    80% { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

/* JSON 语法高亮效果 */
.section-content {
    color: #a3be8c; /* 字符串绿色 */
}

/* 深色主题下的代码样式 */
[data-theme='dark'] .section-content {
    background: #1e2127;
    border-color: #3d4148;
}

/* TODO 列表样式 */
.todo-block {
    background: var(--bg-tertiary);
    border-radius: 8px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--border-light);
}

.todo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 0.2s;
}

.todo-header:hover {
    background: var(--bg-hover);
}

.todo-icon {
    font-size: 16px;
}

.todo-title {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
}

.todo-progress {
    font-size: 12px;
    color: var(--accent-color);
    font-weight: 500;
    background: rgba(52, 199, 89, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
}

.todo-items {
    border-top: 1px solid var(--border-light);
    padding: 8px 0;
}

.todo-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 12px;
    transition: background 0.2s;
}

.todo-item:hover {
    background: var(--bg-hover);
}

.todo-item-status {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
}

.todo-item-status .status-icon {
    width: 14px;
    height: 14px;
}

.todo-item-status .status-icon.completed {
    color: var(--accent-color);
}

.todo-item-status .status-icon.in-progress {
    color: #f5a623;
}

.todo-item-status .status-icon.failed {
    color: #ef4444;
}

.todo-item-status .status-icon.pending {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-color);
    border-radius: 50%;
}

.todo-item-content {
    flex: 1;
    min-width: 0;
}

.todo-item-text {
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.4;
}

.todo-item.completed .todo-item-text {
    color: var(--text-secondary);
    text-decoration: line-through;
}

.todo-item-result {
    display: block;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 4px;
}

/* 浅色主题下的代码样式 */
[data-theme='light'] .section-content {
    background: #f5f7f9;
    border-color: #e1e5e9;
    color: #2e7d32;
}

.detail-section {
    margin-bottom: 8px;
}

.detail-section:last-child {
    margin-bottom: 0;
}

.detail-label {
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 4px;
    font-weight: 500;
}

.detail-code {
    background: var(--bg-primary);
    border-radius: 4px;
    padding: 8px;
    font-size: 11px;
    overflow-x: auto;
    margin: 0;
    color: var(--text-secondary);
    max-height: 300px;
    overflow-y: auto;
    font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
}

.detail-code.full-result {
    max-height: 500px;
}

/* AI 回复文本 */
.assistant-text {
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
}

.streaming-text {
    white-space: pre-wrap;
}

.cursor {
    display: inline-block;
    color: var(--accent-color);
    animation: blink 1s step-end infinite;
    margin-left: 1px;
}

@keyframes blink {
    0%,
    50% {
        opacity: 1;
    }
    51%,
    100% {
        opacity: 0;
    }
}

/* 旋转动画 */
.spinner {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* 工具选择器 - 紧凑版 */
.tools-selector {
    max-width: var(--max-chat-width);
    margin: 0 auto 8px;
    padding: 0 16px;
    position: relative;
}

.tools-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.15s;
}

.tools-trigger:hover {
    background: var(--bg-hover);
}

.tools-trigger .chevron {
    transition: transform 0.2s;
}

.tools-trigger .chevron.expanded {
    transform: rotate(180deg);
}

.tools-dropdown {
    position: absolute;
    bottom: 100%;
    left: 16px;
    margin-bottom: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 200px;
    max-width: 300px;
    z-index: 100;
}

.tools-actions {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-color);
}

.tools-actions button {
    background: none;
    border: none;
    color: var(--accent-color);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
}

.tools-actions button:hover {
    text-decoration: underline;
}

.tools-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 4px;
}

.tool-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
}

.tool-option:hover {
    background: var(--bg-hover);
}

.tool-option input {
    accent-color: var(--accent-color);
    width: 14px;
    height: 14px;
}

.tool-option .tool-name {
    font-size: 12px;
    color: var(--text-primary);
}

/* 底部固定区域 */
.bottom-area {
    flex-shrink: 0;
    background: var(--bg-primary);
    border-top: 1px solid var(--border-subtle);
}

/* 固定 TODO 面板 - 紧凑风格 */
.fixed-todo-panel {
    max-width: var(--max-chat-width);
    margin: 0 auto;
    padding: 6px 16px;
    background: var(--bg-secondary);
    font-size: 11px;
    border-bottom: 1px solid var(--border-subtle);
}

.fixed-todo-header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
}

.fixed-todo-icon {
    font-size: 11px;
}

.fixed-todo-title {
    flex: 1;
    font-weight: 500;
    color: var(--text-primary);
    font-size: 11px;
}

.fixed-todo-progress {
    font-size: 10px;
    color: var(--accent-color);
    background: rgba(16, 185, 129, 0.15);
    padding: 1px 5px;
    border-radius: 3px;
}

.fixed-todo-items {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
}

.fixed-todo-item {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 11px;
}

.fixed-todo-item.completed {
    color: var(--text-muted);
}

.fixed-todo-item.completed .fixed-todo-text {
    text-decoration: line-through;
}

.fixed-todo-status {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.fixed-todo-status .pending-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--text-muted);
}

.fixed-todo-text {
    font-size: 11px;
    white-space: nowrap;
}

/* 输入区域 */
.input-area {
    padding: 8px 16px 12px;
}

.input-box {
    max-width: var(--max-chat-width);
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 6px 6px 6px 14px;
    transition: border-color 0.2s;
}

.input-box:focus-within {
    border-color: var(--accent-color);
}

.input-box textarea {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary);
    padding: 6px 0;
    max-height: 150px;
}

.input-box textarea::placeholder {
    color: var(--text-placeholder);
}

.send-btn,
.stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
}

.send-btn {
    background: var(--accent-color);
    color: white;
}

.send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
}

.send-btn:disabled {
    background: var(--bg-hover);
    color: var(--text-tertiary);
    cursor: not-allowed;
}

.stop-btn {
    background: var(--error-color);
    color: white;
}

.stop-btn:hover {
    background: #dc2626;
}

.hint {
    max-width: var(--max-chat-width);
    margin: 6px auto 0;
    text-align: center;
    font-size: 11px;
    color: var(--text-tertiary);
}

.hint .error {
    color: var(--error-color);
}

.hint .warning {
    color: var(--warning-color);
}

/* 图片链接输入区域 */
.image-url-input-area {
    max-width: var(--max-chat-width);
    margin: 0 auto 8px;
    padding: 0 16px;
}

.image-url-input {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 8px 12px;
}

.image-url-input input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: var(--text-primary);
}

.image-url-input input::placeholder {
    color: var(--text-placeholder);
}

.image-url-input .confirm-btn,
.image-url-input .cancel-btn {
    padding: 4px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
}

.image-url-input .confirm-btn {
    background: var(--accent-color);
    color: white;
}

.image-url-input .confirm-btn:hover {
    background: var(--accent-hover);
}

.image-url-input .cancel-btn {
    background: var(--bg-hover);
    color: var(--text-secondary);
}

.image-url-input .cancel-btn:hover {
    background: var(--border-color);
}

/* 图片预览区域 */
.image-preview-area {
    max-width: var(--max-chat-width);
    margin: 0 auto 8px;
    padding: 0 16px;
}

.image-preview-list {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.image-preview-item {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color);
}

.image-preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.remove-image-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.remove-image-btn:hover {
    background: var(--error-color);
}

/* 图片上传按钮 */
.upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
}

.upload-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--accent-color);
}

.upload-btn:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
}

/* 用户消息样式 */
.user-message-wrapper {
    max-width: 75%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
}

.user-images {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.user-image {
    max-width: 200px;
    max-height: 150px;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.2s;
    object-fit: contain;
    background: var(--bg-tertiary);
}

.user-image:hover {
    transform: scale(1.02);
}
</style>

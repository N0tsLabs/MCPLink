<template>
    <div class="layout" :class="{ 'settings-mode': isSettingsPage }">
        <!-- 聊天侧边栏 - 仅在非设置页面显示 -->
        <aside v-if="!isSettingsPage" class="sidebar" :class="{ collapsed: !store.sidebarOpen }">
            <div class="sidebar-header">
                <button class="btn btn-ghost btn-icon" @click="store.toggleSidebar">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                </button>
                <button class="btn btn-ghost btn-icon" @click="handleNewChat" title="新建对话">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>

            <div class="sidebar-content">
                <div class="conversation-list">
                    <div
                        v-for="conv in store.conversations"
                        :key="conv.id"
                        class="conversation-item"
                        :class="{ active: conv.id === store.currentConversationId }"
                        @click="store.setCurrentConversation(conv.id)"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <!-- 编辑模式 -->
                        <input
                            v-if="editingConversationId === conv.id"
                            ref="editInputRef"
                            type="text"
                            class="conversation-title-input"
                            :value="editingTitle"
                            @input="editingTitle = ($event.target as HTMLInputElement).value"
                            @keydown.enter="saveTitle(conv.id)"
                            @keydown.escape="cancelEditTitle"
                            @blur="saveTitle(conv.id)"
                            @click.stop
                        />
                        <!-- 显示模式 -->
                        <span v-else class="conversation-title" @dblclick.stop="startEditTitle(conv.id, conv.title)">{{
                            conv.title
                        }}</span>
                        <button class="delete-btn" @click.stop="handleDeleteConversation(conv.id)" title="删除">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path
                                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                ></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <div class="sidebar-footer">
                <router-link to="/settings/service" class="sidebar-menu-item">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="12" cy="12" r="3"></circle>
                        <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                        ></path>
                    </svg>
                    <span>设置</span>
                </router-link>
            </div>
        </aside>

        <!-- 主内容区 -->
        <main class="main">
            <!-- 顶部栏 - 仅在非设置页面显示 -->
            <header v-if="!isSettingsPage" class="header">
                <button v-if="!store.sidebarOpen" class="btn btn-ghost btn-icon" @click="store.toggleSidebar">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                </button>

                <div class="header-center">
                    <!-- 模型选择 -->
                    <div class="model-selector">
                        <select v-model="selectedModelId" class="model-select">
                            <option v-for="model in store.enabledModels" :key="model.id" :value="model.id">
                                {{ model.name }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="header-right">
                    <span class="connection-status" :class="{ connected: store.isConnected }">
                        {{ store.isConnected ? '已连接' : '未连接' }}
                    </span>
                </div>
            </header>

            <!-- 内容 -->
            <div class="content" :class="{ 'settings-content': isSettingsPage }">
                <router-view />
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { api } from '@/api'

const route = useRoute()
const store = useAppStore()
const selectedModelId = ref<string | null>(null)

// 标题编辑相关
const editingConversationId = ref<string | null>(null)
const editingTitle = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

// 判断是否在设置页面
const isSettingsPage = computed(() => {
    return route.path.startsWith('/settings')
})

// 同步模型选择
watch(
    () => store.currentModelId,
    (id) => {
        selectedModelId.value = id
    },
    { immediate: true }
)

watch(selectedModelId, (id) => {
    if (id) {
        store.setCurrentModel(id)
    }
})

// 新建对话
async function handleNewChat() {
    await store.createConversation()
}

// 删除对话
async function handleDeleteConversation(id: string) {
    if (confirm('确定要删除这个会话吗？')) {
        await store.deleteConversation(id)
    }
}

// 开始编辑标题
function startEditTitle(convId: string, currentTitle: string) {
    editingConversationId.value = convId
    editingTitle.value = currentTitle
    nextTick(() => {
        if (editInputRef.value) {
            editInputRef.value.focus()
            editInputRef.value.select()
        }
    })
}

// 保存标题
async function saveTitle(convId: string) {
    if (!editingConversationId.value) return

    const newTitle = editingTitle.value.trim()
    if (newTitle && newTitle !== '') {
        try {
            await api.updateConversation(convId, { title: newTitle })
            store.updateConversationTitle(convId, newTitle)
        } catch (error) {
            console.error('Failed to update title:', error)
        }
    }

    editingConversationId.value = null
    editingTitle.value = ''
}

// 取消编辑
function cancelEditTitle() {
    editingConversationId.value = null
    editingTitle.value = ''
}

onMounted(() => {
    store.initialize()
})
</script>

<style scoped>
.layout {
    display: flex;
    height: 100vh;
    background: var(--bg-primary);
}

/* 侧边栏 */
.sidebar {
    width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    transition:
        width var(--transition-normal),
        opacity var(--transition-normal);
    flex-shrink: 0;
}

.sidebar.collapsed {
    width: 0;
    opacity: 0;
    overflow: hidden;
}

.sidebar-header {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--border-light);
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.conversation-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.conversation-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
    color: var(--text-secondary);
}

.conversation-item:hover {
    background: var(--bg-hover);
}

.conversation-item.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.conversation-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    cursor: text;
}

.conversation-title-input {
    flex: 1;
    background: var(--bg-primary);
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 14px;
    color: var(--text-primary);
    outline: none;
    min-width: 0;
}

.delete-btn {
    opacity: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all var(--transition-fast);
}

.conversation-item:hover .delete-btn {
    opacity: 1;
}

.delete-btn:hover {
    background: var(--bg-active);
    color: var(--error-color);
}

.sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--border-light);
}

.sidebar-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    text-decoration: none;
    transition: all var(--transition-fast);
}

.sidebar-menu-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    text-decoration: none;
}

/* 主区域 */
.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-primary);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-height);
    padding: 0 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
}

.header-center {
    flex: 1;
    display: flex;
    justify-content: center;
}

.model-selector {
    position: relative;
}

.model-select {
    appearance: none;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 8px 32px 8px 14px;
    font-size: 14px;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238e8e8e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
}

.model-select:focus {
    border-color: var(--accent-color);
}

.header-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

.connection-status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    background: rgba(239, 68, 68, 0.2);
    color: var(--error-color);
}

.connection-status.connected {
    background: rgba(16, 185, 129, 0.2);
    color: var(--success-color);
}

.content {
    flex: 1;
    overflow: hidden;
}

.content.settings-content {
    height: 100vh;
    overflow: auto;
}
</style>

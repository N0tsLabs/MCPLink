<template>
    <div class="setting-page">
        <div class="page-header">
            <div>
                <h2>模型渠道</h2>
                <p class="description">配置 AI 模型渠道，一个渠道可包含多个模型。</p>
            </div>
            <button class="btn btn-primary" @click="showAddChannelModal">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                新增渠道
            </button>
        </div>

        <!-- 渠道列表 -->
        <div class="channel-list" v-if="channels.length > 0">
            <div v-for="channel in channels" :key="channel.id" class="channel-card">
                <div class="channel-header">
                    <div class="channel-info">
                        <span class="channel-name">{{ channel.name }}</span>
                        <span class="channel-model-count">{{ channel.models.length }} 个模型</span>
                        <span class="tag" :class="channel.enabled ? 'tag-success' : ''">
                            {{ channel.enabled ? '已启用' : '已停用' }}
                        </span>
                    </div>
                    <div class="channel-actions">
                        <div class="switch" :class="{ active: channel.enabled }" @click="toggleChannel(channel)"></div>
                        <button class="btn btn-ghost btn-icon" @click="editChannel(channel)" title="编辑">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn btn-ghost btn-icon" @click="deleteChannel(channel)" title="删除">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
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
                <div class="channel-details">
                    <div class="detail-row">
                        <span class="detail-label">Base URL</span>
                        <span class="detail-value truncate">{{ channel.baseURL }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">模型</span>
                        <div class="model-tags">
                            <span v-for="model in channel.models.slice(0, 5)" :key="model" class="model-tag">
                                {{ model }}
                            </span>
                            <span v-if="channel.models.length > 5" class="model-tag more">
                                +{{ channel.models.length - 5 }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty">
            <div class="empty-icon">🔗</div>
            <p class="empty-text">暂无模型渠道</p>
            <p class="empty-hint">点击「新增渠道」配置 AI 模型</p>
        </div>

        <!-- 添加/编辑渠道模态框 -->
        <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <span class="modal-title">{{ editingChannel ? '编辑渠道' : '新增渠道' }}</span>
                    <button class="btn btn-ghost btn-icon" @click="closeModal">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">渠道名称 *</label>
                        <input
                            type="text"
                            class="input"
                            v-model="form.name"
                            placeholder="如: OpenAI、Claude、DeepSeek"
                        />
                    </div>

                    <div class="form-group">
                        <label class="form-label">Base URL *</label>
                        <input
                            type="text"
                            class="input"
                            v-model="form.baseURL"
                            placeholder="如: https://api.openai.com/v1"
                        />
                        <p class="form-hint">填写 OpenAI 兼容的 API 地址</p>
                    </div>

                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <div class="input-row">
                            <input type="text" class="input" v-model="form.apiKey" placeholder="sk-..." />
                            <button
                                class="btn btn-secondary"
                                @click="fetchModels"
                                :disabled="fetchingModels || !form.baseURL"
                            >
                                <svg
                                    v-if="fetchingModels"
                                    class="spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                </svg>
                                {{ fetchingModels ? '获取中...' : '获取模型' }}
                            </button>
                        </div>
                    </div>

                    <!-- 模型选择 -->
                    <div class="form-group">
                        <div class="form-label-row">
                            <label class="form-label">模型列表 *</label>
                            <div class="select-actions">
                                <button
                                    v-if="availableModels.length > 0"
                                    class="btn btn-sm btn-ghost"
                                    @click="selectAllModels"
                                >
                                    全选
                                </button>
                                <button
                                    v-if="selectedModels.size > 0"
                                    class="btn btn-sm btn-ghost btn-danger"
                                    @click="clearSelectedModels"
                                >
                                    清空模型
                                </button>
                            </div>
                        </div>

                        <!-- 已选择的模型标签 -->
                        <div class="selected-models" v-if="selectedModels.size > 0">
                            <div v-for="model in selectedModels" :key="model" class="selected-model-tag">
                                <span>{{ model }}</span>
                                <button class="remove-btn" @click="removeModel(model)">×</button>
                            </div>
                        </div>

                        <!-- 远程模型列表（可多选） -->
                        <div v-if="availableModels.length > 0" class="model-select-list">
                            <label
                                v-for="model in availableModels"
                                :key="model"
                                class="model-checkbox"
                                :class="{ selected: selectedModels.has(model) }"
                            >
                                <input
                                    type="checkbox"
                                    :checked="selectedModels.has(model)"
                                    @change="toggleModelSelection(model)"
                                />
                                <span class="model-id">{{ model }}</span>
                            </label>
                        </div>

                        <!-- 手动输入（无法获取时） -->
                        <div v-else class="manual-input-section">
                            <p class="form-hint">输入模型名称后按 Enter 添加，或用逗号分隔多个模型</p>
                            <div class="input-row">
                                <input
                                    type="text"
                                    class="input"
                                    v-model="manualModelInput"
                                    placeholder="gpt-4o, gpt-4o-mini"
                                    @keydown.enter.prevent="addManualModels"
                                />
                                <button class="btn btn-secondary" @click="addManualModels">添加</button>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">启用渠道</label>
                        <div
                            class="switch"
                            :class="{ active: form.enabled }"
                            @click="form.enabled = !form.enabled"
                        ></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" @click="closeModal">取消</button>
                    <button class="btn btn-primary" @click="saveChannel" :disabled="saving || !canSave">
                        {{ saving ? '保存中...' : editingChannel ? '保存' : '创建渠道' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/api'
import { toast } from '@/composables/useToast'
import type { ModelChannel } from '@/api/types'

const store = useAppStore()
const modalVisible = ref(false)
const editingChannel = ref<ModelChannel | null>(null)
const saving = ref(false)
const fetchingModels = ref(false)
const availableModels = ref<string[]>([])
const selectedModels = ref(new Set<string>())
const manualModelInput = ref('')
const channels = ref<ModelChannel[]>([])

const form = reactive({
    name: '',
    baseURL: '',
    apiKey: '',
    enabled: true,
})

const canSave = computed(() => {
    return form.name.trim() && form.baseURL.trim() && selectedModels.value.size > 0
})

onMounted(() => {
    loadChannels()
})

// 从现有模型数据中构建渠道列表
async function loadChannels() {
    await store.fetchModels()

    // 按 baseURL 分组
    const channelMap = new Map<string, ModelChannel>()

    for (const model of store.models) {
        const key = `${model.baseURL}|${model.apiKey}`

        if (!channelMap.has(key)) {
            channelMap.set(key, {
                id: model.channelId || model.id,
                name: getChannelName(model.baseURL),
                baseURL: model.baseURL,
                apiKey: model.apiKey,
                models: [],
                enabled: model.enabled,
                createdAt: Date.now(),
            })
        }

        const channel = channelMap.get(key)!
        channel.models.push(model.model)
        // 只要有一个模型启用，渠道就启用
        if (model.enabled) {
            channel.enabled = true
        }
    }

    channels.value = Array.from(channelMap.values())
}

function getChannelName(baseURL: string): string {
    if (baseURL.includes('openai')) return 'OpenAI'
    if (baseURL.includes('anthropic')) return 'Claude'
    if (baseURL.includes('deepseek')) return 'DeepSeek'
    if (baseURL.includes('moonshot')) return 'Moonshot'
    if (baseURL.includes('zhipu')) return '智谱 AI'
    try {
        const url = new URL(baseURL)
        return url.hostname
    } catch {
        return '自定义渠道'
    }
}

function showAddChannelModal() {
    editingChannel.value = null
    form.name = ''
    form.baseURL = ''
    form.apiKey = ''
    form.enabled = true
    availableModels.value = []
    selectedModels.value.clear()
    manualModelInput.value = ''
    modalVisible.value = true
}

function editChannel(channel: ModelChannel) {
    editingChannel.value = channel
    form.name = channel.name
    form.baseURL = channel.baseURL
    form.apiKey = channel.apiKey
    form.enabled = channel.enabled
    availableModels.value = []
    selectedModels.value = new Set(channel.models)
    manualModelInput.value = ''
    modalVisible.value = true
}

function closeModal() {
    modalVisible.value = false
}

async function fetchModels() {
    if (!form.baseURL) {
        toast.warning('请先填写 Base URL')
        return
    }

    fetchingModels.value = true

    try {
        const result = await api.fetchRemoteModels(form.baseURL, form.apiKey)

        if (result.models && result.models.length > 0) {
            availableModels.value = result.models.sort()

            // 如果是编辑模式，保持已选模型
            if (!editingChannel.value) {
                // 新增模式：自动选择常用模型
                const commonModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude']
                for (const m of result.models) {
                    if (commonModels.some((c) => m.toLowerCase().includes(c.toLowerCase()))) {
                        selectedModels.value.add(m)
                    }
                }
            }

            toast.success(`获取到 ${result.models.length} 个模型`)
        } else {
            toast.warning('未获取到模型列表，请手动输入')
        }
    } catch (error: any) {
        toast.error(`获取失败: ${error.message || '未知错误'}`)
    } finally {
        fetchingModels.value = false
    }
}

function toggleModelSelection(model: string) {
    if (selectedModels.value.has(model)) {
        selectedModels.value.delete(model)
    } else {
        selectedModels.value.add(model)
    }
}

function selectAllModels() {
    for (const model of availableModels.value) {
        selectedModels.value.add(model)
    }
}

function clearSelectedModels() {
    selectedModels.value.clear()
}

function removeModel(model: string) {
    selectedModels.value.delete(model)
}

function addManualModels() {
    const input = manualModelInput.value.trim()
    if (!input) return

    const models = input
        .split(/[,，\n]/)
        .map((m) => m.trim())
        .filter((m) => m)
    for (const model of models) {
        selectedModels.value.add(model)
    }
    manualModelInput.value = ''
}

async function saveChannel() {
    if (!canSave.value) return

    saving.value = true

    try {
        const models = Array.from(selectedModels.value)

        if (editingChannel.value) {
            // 编辑模式：删除旧模型，创建新模型
            // 先找出该渠道下的所有模型
            const oldModels = store.models.filter(
                (m) => m.baseURL === editingChannel.value!.baseURL && m.apiKey === editingChannel.value!.apiKey
            )

            // 删除所有旧模型
            for (const m of oldModels) {
                await api.deleteModel(m.id)
            }

            // 创建新模型
            for (const modelId of models) {
                await api.createModel({
                    name: modelId,
                    model: modelId,
                    baseURL: form.baseURL,
                    apiKey: form.apiKey,
                    enabled: form.enabled,
                })
            }

            toast.success('渠道更新成功')
        } else {
            // 新增模式：批量创建模型
            for (const modelId of models) {
                await api.createModel({
                    name: modelId,
                    model: modelId,
                    baseURL: form.baseURL,
                    apiKey: form.apiKey,
                    enabled: form.enabled,
                })
            }

            toast.success(`成功创建渠道，包含 ${models.length} 个模型`)
        }

        closeModal()
        loadChannels()
    } catch (error: any) {
        toast.error(`保存失败: ${error.message || '未知错误'}`)
    } finally {
        saving.value = false
    }
}

async function toggleChannel(channel: ModelChannel) {
    try {
        // 切换该渠道下所有模型的启用状态
        const newEnabled = !channel.enabled
        const channelModels = store.models.filter((m) => m.baseURL === channel.baseURL && m.apiKey === channel.apiKey)

        for (const m of channelModels) {
            if (m.enabled !== newEnabled) {
                await api.toggleModel(m.id)
            }
        }

        loadChannels()
    } catch (error) {
        toast.error('操作失败')
    }
}

async function deleteChannel(channel: ModelChannel) {
    if (!confirm(`确定要删除渠道「${channel.name}」及其所有模型吗？`)) return

    try {
        // 删除该渠道下的所有模型
        const channelModels = store.models.filter((m) => m.baseURL === channel.baseURL && m.apiKey === channel.apiKey)

        for (const m of channelModels) {
            await api.deleteModel(m.id)
        }

        toast.success('渠道删除成功')
        loadChannels()
    } catch (error) {
        toast.error('删除失败')
    }
}
</script>

<style scoped>
.setting-page {
    width: 100%;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
}

.page-header h2 {
    margin-bottom: 6px;
    font-size: 22px;
    font-weight: 600;
}

.description {
    color: var(--text-secondary);
    font-size: 14px;
}

/* 渠道列表 */
.channel-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.channel-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
}

.channel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.channel-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.channel-name {
    font-size: 16px;
    font-weight: 600;
}

.channel-model-count {
    font-size: 13px;
    color: var(--text-tertiary);
}

.channel-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.channel-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
}

.detail-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    font-size: 13px;
}

.detail-label {
    color: var(--text-tertiary);
    min-width: 70px;
    flex-shrink: 0;
}

.detail-value {
    flex: 1;
    min-width: 0;
}

.truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 模型标签 */
.model-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.model-tag {
    display: inline-block;
    padding: 2px 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    color: var(--text-secondary);
}

.model-tag.more {
    background: var(--accent-color-light);
    color: var(--accent-color);
    border-color: var(--accent-color);
}

/* 已选择的模型 */
.selected-models {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    max-height: 150px;
    overflow-y: auto;
}

.selected-model-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 10px;
    background: var(--accent-color);
    color: white;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.selected-model-tag .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    color: white;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
}

.selected-model-tag .remove-btn:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* 模型选择列表 */
.form-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.form-label-row .form-label {
    margin-bottom: 0;
}

.select-actions {
    display: flex;
    gap: 8px;
}

.select-actions .btn-ghost.btn-danger {
    background: transparent;
    color: #ef4444;
}

.select-actions .btn-ghost.btn-danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

.input-row {
    display: flex;
    gap: 12px;
}

.input-row .input {
    flex: 1;
}

.model-select-list {
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
}

.model-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
}

.model-checkbox:hover {
    background: var(--bg-hover);
}

.model-checkbox.selected {
    background: rgba(16, 163, 127, 0.1);
}

.model-checkbox input {
    accent-color: var(--accent-color);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.model-id {
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.manual-input-section {
    margin-top: 8px;
}

/* 空状态 */
.empty {
    text-align: center;
    padding: 80px 20px;
}

.empty-icon {
    font-size: 64px;
    margin-bottom: 20px;
}

.empty-text {
    color: var(--text-secondary);
    font-size: 16px;
    margin-bottom: 8px;
}

.empty-hint {
    color: var(--text-tertiary);
    font-size: 14px;
}

/* 模态框 */
.modal-lg {
    max-width: 650px;
}

.spin {
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
</style>

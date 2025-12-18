<template>
    <div class="setting-page">
        <div class="page-header">
            <div>
                <h2>MCP 工具管理</h2>
                <p class="description">配置 MCP 服务，让 AI 可以调用外部工具。</p>
            </div>
            <div class="header-actions">
                <!-- 模式切换 -->
                <div class="mode-tabs">
                    <button class="mode-tab" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                        列表
                    </button>
                    <button class="mode-tab" :class="{ active: viewMode === 'json' }" @click="switchToJsonMode">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        JSON
                    </button>
                </div>
                <button v-if="viewMode === 'list'" class="btn btn-primary" @click="showAddModal">
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
                    添加服务
                </button>
                <button v-else class="btn btn-primary" @click="saveJsonConfig" :disabled="jsonSaving">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    {{ jsonSaving ? '保存中...' : '保存配置' }}
                </button>
            </div>
        </div>

        <!-- 列表模式 -->
        <template v-if="viewMode === 'list'">
            <div class="server-list" v-if="store.mcpServers.length > 0">
                <div v-for="server in store.mcpServers" :key="server.id" class="server-card">
                    <div class="server-header">
                        <div class="server-info">
                            <span class="server-name">📦 {{ server.name }}</span>
                            <span class="tag" :class="getStatusClass(server.status)">
                                {{ getStatusText(server.status) }}
                            </span>
                            <span v-if="server.error" class="error-hint" :title="server.error">
                                ⚠️ 点击查看错误
                            </span>
                        </div>
                        <div class="server-actions">
                            <button
                                v-if="server.status !== 'running'"
                                class="btn btn-sm btn-secondary"
                                @click="startServer(server.id)"
                                :disabled="serverLoading[server.id]"
                            >
                                {{ serverLoading[server.id] ? '启动中...' : '启动' }}
                            </button>
                            <button
                                v-else
                                class="btn btn-sm btn-secondary"
                                @click="stopServer(server.id)"
                                :disabled="serverLoading[server.id]"
                            >
                                {{ serverLoading[server.id] ? '停止中...' : '停止' }}
                            </button>
                            <button class="btn btn-ghost btn-icon" @click="editServer(server)" title="编辑">
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
                            <button class="btn btn-ghost btn-icon" @click="deleteServer(server.id)" title="删除">
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

                    <div class="server-details">
                        <div class="detail-row">
                            <span class="detail-label">类型</span>
                            <span>{{ server.type === 'stdio' ? '本地命令' : 'SSE 远程' }}</span>
                        </div>
                        <div v-if="server.type === 'stdio'" class="detail-row">
                            <span class="detail-label">命令</span>
                            <code>{{ server.command }} {{ server.args?.join(' ') }}</code>
                        </div>
                        <div v-else class="detail-row">
                            <span class="detail-label">地址</span>
                            <span>{{ server.url }}</span>
                        </div>
                        <div v-if="server.env && Object.keys(server.env).length > 0" class="detail-row">
                            <span class="detail-label">环境变量</span>
                            <span class="env-count">{{ Object.keys(server.env).length }} 个</span>
                        </div>
                    </div>

                    <!-- 错误信息展示 -->
                    <div v-if="server.error" class="error-section">
                        <div class="error-header">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <span>启动失败</span>
                        </div>
                        <pre class="error-message">{{ server.error }}</pre>
                    </div>

                    <div v-if="server.tools && server.tools.length > 0" class="tools-section">
                        <div class="tools-header" @click="toggleTools(server.id)">
                            <span>提供的工具 ({{ server.tools.length }})</span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                :style="{ transform: expandedServers.has(server.id) ? 'rotate(180deg)' : '' }"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        <div v-if="expandedServers.has(server.id)" class="tools-list">
                            <div v-for="tool in server.tools" :key="tool.name" class="tool-item">
                                <span class="tool-name">{{ tool.name }}</span>
                                <span class="tool-desc">{{ tool.description }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="empty">
                <div class="empty-icon">🔧</div>
                <p class="empty-text">暂无 MCP 服务配置</p>
                <p class="empty-hint">点击上方「添加服务」按钮或切换到「JSON」模式进行配置</p>
            </div>
        </template>

        <!-- JSON 编辑模式 -->
        <template v-else>
            <div class="json-editor-wrapper">
                <div class="json-tips">
                    <div class="tip-icon">💡</div>
                    <div class="tip-content">
                        <p>
                            <strong>JSON 配置格式</strong>：直接编辑完整的 MCP 服务配置，支持批量添加和修改。按
                            <kbd>Ctrl</kbd> + <kbd>S</kbd> 快速保存。
                        </p>
                        <p>
                            配置格式参考 <a href="https://modelcontextprotocol.io/docs" target="_blank">MCP 官方文档</a>
                        </p>
                    </div>
                </div>
                <div class="editor-container">
                    <vue-monaco-editor
                        v-model:value="jsonConfig"
                        language="json"
                        :theme="store.theme === 'dark' ? 'vs-dark' : 'vs'"
                        :options="editorOptions"
                        @mount="handleEditorMount"
                    />
                </div>
                <div v-if="jsonError" class="json-error">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    {{ jsonError }}
                </div>
            </div>
        </template>

        <!-- 添加/编辑模态框 -->
        <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <span class="modal-title">{{ editingServer ? '编辑 MCP 服务' : '添加 MCP 服务' }}</span>
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
                        <label class="form-label">名称 *</label>
                        <input type="text" class="input" v-model="form.name" placeholder="如: github" />
                    </div>

                    <div class="form-group">
                        <label class="form-label">连接类型</label>
                        <div class="radio-group">
                            <label class="radio-item">
                                <input type="radio" v-model="form.type" value="stdio" />
                                <span>本地命令 (stdio)</span>
                            </label>
                            <label class="radio-item">
                                <input type="radio" v-model="form.type" value="sse" />
                                <span>远程服务 (SSE)</span>
                            </label>
                        </div>
                    </div>

                    <template v-if="form.type === 'stdio'">
                        <div class="form-group">
                            <label class="form-label">命令 *</label>
                            <input
                                type="text"
                                class="input"
                                v-model="form.command"
                                placeholder="如: docker, node, npx"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">参数</label>
                            <input
                                type="text"
                                class="input"
                                v-model="form.argsStr"
                                placeholder="如: run -i --rm mcp/github"
                            />
                            <p class="form-hint">多个参数用空格分隔</p>
                        </div>

                        <!-- 环境变量配置 -->
                        <div class="form-group">
                            <div class="form-label-row">
                                <label class="form-label">环境变量</label>
                                <button type="button" class="btn btn-sm btn-ghost" @click="addEnvVar">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    添加
                                </button>
                            </div>
                            <div class="env-list" v-if="form.envVars.length > 0">
                                <div v-for="(env, index) in form.envVars" :key="index" class="env-row">
                                    <input type="text" class="input env-key" v-model="env.key" placeholder="变量名" />
                                    <span class="env-eq">=</span>
                                    <input type="text" class="input env-value" v-model="env.value" placeholder="值" />
                                    <button type="button" class="btn btn-ghost btn-icon" @click="removeEnvVar(index)">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
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
                            </div>
                            <p class="form-hint">设置运行命令时需要的环境变量，如 API Token</p>
                        </div>
                    </template>

                    <template v-else>
                        <div class="form-group">
                            <label class="form-label">服务地址 *</label>
                            <input
                                type="text"
                                class="input"
                                v-model="form.url"
                                placeholder="http://localhost:3001/mcp"
                            />
                        </div>
                    </template>

                    <div class="form-group">
                        <label class="form-label">启用</label>
                        <div
                            class="switch"
                            :class="{ active: form.enabled }"
                            @click="form.enabled = !form.enabled"
                        ></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" @click="closeModal">取消</button>
                    <button class="btn btn-primary" @click="saveServer" :disabled="saving">
                        {{ saving ? '保存中...' : '保存' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/api'
import { toast } from '@/composables/useToast'
import type { MCPServer } from '@/api/types'

const store = useAppStore()
const viewMode = ref<'list' | 'json'>('list')
const modalVisible = ref(false)
const editingServer = ref<MCPServer | null>(null)
const saving = ref(false)
const jsonSaving = ref(false)
const serverLoading = ref<Record<string, boolean>>({})
const expandedServers = ref(new Set<string>())
const jsonConfig = ref('')
const jsonError = ref('')
let monacoEditor: any = null

// Monaco Editor 配置
const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on' as const,
    formatOnPaste: true,
    formatOnType: true,
}

interface EnvVar {
    key: string
    value: string
}

const form = reactive({
    name: '',
    type: 'stdio' as 'stdio' | 'sse',
    command: '',
    argsStr: '',
    url: '',
    enabled: true,
    envVars: [] as EnvVar[],
})

function getStatusClass(status?: string) {
    switch (status) {
        case 'running':
            return 'tag-success'
        case 'starting':
            return 'tag-warning'
        case 'error':
            return 'tag-error'
        default:
            return ''
    }
}

function getStatusText(status?: string) {
    switch (status) {
        case 'running':
            return '运行中'
        case 'starting':
            return '启动中'
        case 'error':
            return '错误'
        default:
            return '已停止'
    }
}

function toggleTools(serverId: string) {
    if (expandedServers.value.has(serverId)) {
        expandedServers.value.delete(serverId)
    } else {
        expandedServers.value.add(serverId)
    }
}

function addEnvVar() {
    form.envVars.push({ key: '', value: '' })
}

function removeEnvVar(index: number) {
    form.envVars.splice(index, 1)
}

function envVarsToRecord(envVars: EnvVar[]): Record<string, string> | undefined {
    const result: Record<string, string> = {}
    for (const { key, value } of envVars) {
        if (key.trim()) {
            result[key.trim()] = value
        }
    }
    return Object.keys(result).length > 0 ? result : undefined
}

function recordToEnvVars(env?: Record<string, string>): EnvVar[] {
    if (!env) return []
    return Object.entries(env).map(([key, value]) => ({ key, value }))
}

// 切换到 JSON 模式时，生成当前配置的 JSON
function switchToJsonMode() {
    const config = {
        mcpServers: {} as Record<string, any>,
    }

    for (const server of store.mcpServers) {
        const serverConfig: any = {}

        if (server.type === 'stdio') {
            serverConfig.command = server.command
            if (server.args && server.args.length > 0) {
                serverConfig.args = server.args
            }
            if (server.env && Object.keys(server.env).length > 0) {
                serverConfig.env = server.env
            }
        } else {
            serverConfig.url = server.url
            if (server.headers && Object.keys(server.headers).length > 0) {
                serverConfig.headers = server.headers
            }
        }

        config.mcpServers[server.name] = serverConfig
    }

    jsonConfig.value = JSON.stringify(config, null, 2)
    jsonError.value = ''
    viewMode.value = 'json'
}

function handleEditorMount(editor: any) {
    monacoEditor = editor

    // 添加 Ctrl+S 保存快捷键
    editor.addCommand(
        // KeyMod.CtrlCmd | KeyCode.KeyS
        2048 | 49, // Ctrl+S
        () => {
            saveJsonConfig()
        }
    )
}

// 保存 JSON 配置
async function saveJsonConfig() {
    jsonError.value = ''

    try {
        const config = JSON.parse(jsonConfig.value)

        if (!config.mcpServers || typeof config.mcpServers !== 'object') {
            jsonError.value = '配置格式错误：缺少 mcpServers 字段'
            return
        }

        jsonSaving.value = true

        // 并行删除所有现有服务（不等待 MCP 重新初始化）
        const deletePromises = store.mcpServers.map((server) => api.deleteMCPServer(server.id).catch(() => {}))
        await Promise.all(deletePromises)

        // 并行创建新服务
        const createPromises = Object.entries(config.mcpServers).map(([name, serverConfig]) => {
            const cfg = serverConfig as any
            const isStdio = !!cfg.command

            return api
                .createMCPServer({
                    name,
                    type: isStdio ? 'stdio' : 'sse',
                    command: cfg.command,
                    args: cfg.args,
                    env: cfg.env,
                    url: cfg.url,
                    headers: cfg.headers,
                    enabled: true,
                    autoStart: false,
                })
                .catch(() => {})
        })
        await Promise.all(createPromises)

        // 配置保存成功，立即返回
        toast.success('配置已保存')
        viewMode.value = 'list'
        jsonSaving.value = false

        // 后台异步刷新数据，不阻塞 UI
        store.fetchMCPServers()
    } catch (e: any) {
        jsonSaving.value = false
        if (e instanceof SyntaxError) {
            jsonError.value = `JSON 语法错误：${e.message}`
        } else {
            jsonError.value = `保存失败：${e.message || '未知错误'}`
        }
    }
}

function showAddModal() {
    editingServer.value = null
    form.name = ''
    form.type = 'stdio'
    form.command = ''
    form.argsStr = ''
    form.url = ''
    form.enabled = true
    form.envVars = []
    modalVisible.value = true
}

function editServer(server: MCPServer) {
    editingServer.value = server
    form.name = server.name
    form.type = server.type
    form.command = server.command || ''
    form.argsStr = server.args?.join(' ') || ''
    form.url = server.url || ''
    form.enabled = server.enabled
    form.envVars = recordToEnvVars(server.env)
    modalVisible.value = true
}

function closeModal() {
    modalVisible.value = false
}

async function saveServer() {
    if (!form.name) {
        toast.warning('请填写名称')
        return
    }

    if (form.type === 'stdio' && !form.command) {
        toast.warning('请填写命令')
        return
    }

    if (form.type === 'sse' && !form.url) {
        toast.warning('请填写服务地址')
        return
    }

    saving.value = true

    const data = {
        name: form.name,
        type: form.type,
        command: form.type === 'stdio' ? form.command : undefined,
        args: form.type === 'stdio' && form.argsStr ? form.argsStr.split(/\s+/) : undefined,
        env: form.type === 'stdio' ? envVarsToRecord(form.envVars) : undefined,
        url: form.type === 'sse' ? form.url : undefined,
        enabled: form.enabled,
        autoStart: false,
    }

    try {
        if (editingServer.value) {
            await api.updateMCPServer(editingServer.value.id, data)
            toast.success('保存成功')
        } else {
            await api.createMCPServer(data as any)
            toast.success('添加成功')
        }

        closeModal()
        store.fetchMCPServers()
    } catch (error) {
        toast.error('操作失败')
    } finally {
        saving.value = false
    }
}

async function startServer(id: string) {
    serverLoading.value[id] = true
    try {
        await api.startMCPServer(id)
        toast.success('服务已启动')
        store.fetchMCPServers()
    } catch (error) {
        toast.error('启动失败')
    } finally {
        serverLoading.value[id] = false
    }
}

async function stopServer(id: string) {
    serverLoading.value[id] = true
    try {
        await api.stopMCPServer(id)
        toast.success('服务已停止')
        store.fetchMCPServers()
    } catch (error) {
        toast.error('停止失败')
    } finally {
        serverLoading.value[id] = false
    }
}

async function deleteServer(id: string) {
    if (!confirm('确定要删除这个 MCP 服务吗？')) return

    try {
        await api.deleteMCPServer(id)
        toast.success('删除成功')
        store.fetchMCPServers()
    } catch (error) {
        toast.error('删除失败')
    }
}

// 轮询刷新 MCP 状态
let pollInterval: ReturnType<typeof setInterval> | null = null
const POLL_INTERVAL = 2000 // 2秒刷新一次

function startPolling() {
    // 立即获取一次
    store.fetchMCPServers()

    // 定时轮询
    pollInterval = setInterval(() => {
        // 只在列表模式下轮询
        if (viewMode.value === 'list') {
            store.fetchMCPServers()
        }
    }, POLL_INTERVAL)
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
    }
}

onMounted(() => {
    startPolling()
})

onUnmounted(() => {
    stopPolling()
})
</script>

<style scoped>
.setting-page {
    width: 100%;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
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

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.mode-tabs {
    display: flex;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: 3px;
}

.mode-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.mode-tab:hover {
    color: var(--text-primary);
}

.mode-tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.server-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.server-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
}

.server-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.server-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.server-name {
    font-size: 16px;
    font-weight: 600;
}

.server-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.server-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    margin-bottom: 12px;
}

.detail-row {
    display: flex;
    gap: 16px;
    font-size: 13px;
}

.detail-label {
    color: var(--text-tertiary);
    min-width: 60px;
}

.detail-row code {
    background: var(--bg-primary);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.env-count {
    color: var(--accent-color);
    font-size: 12px;
}

/* 错误信息样式 */
.error-section {
    margin-top: 12px;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
}

.error-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #ef4444;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 8px;
}

.error-message {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    color: #ef4444;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    line-height: 1.5;
    max-height: 150px;
    overflow-y: auto;
}

.error-hint {
    font-size: 12px;
    color: #ef4444;
    cursor: help;
}

.tools-section {
    border-top: 1px solid var(--border-light);
    padding-top: 12px;
}

.tools-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    color: var(--accent-color);
    font-size: 13px;
    font-weight: 500;
}

.tools-header svg {
    transition: transform var(--transition-fast);
}

.tools-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.tool-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    padding: 10px 14px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
}

.tool-name {
    font-weight: 600;
    color: var(--accent-color);
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 12px;
}

.tool-desc {
    color: var(--text-secondary);
    line-height: 1.5;
}

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

/* JSON 编辑器样式 */
.json-editor-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.json-tips {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
}

.tip-icon {
    font-size: 20px;
    flex-shrink: 0;
}

.tip-content {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
}

.tip-content p {
    margin: 0;
}

.tip-content p + p {
    margin-top: 4px;
}

.tip-content a {
    color: var(--accent-color);
}

.tip-content kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: 0 1px 0 var(--border-color);
}

.editor-container {
    height: 500px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.json-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: var(--error-color);
    font-size: 13px;
}

/* 表单样式 */
.radio-group {
    display: flex;
    gap: 24px;
}

.radio-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
}

.radio-item input {
    accent-color: var(--accent-color);
    width: 16px;
    height: 16px;
}

.form-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.form-label-row .form-label {
    margin-bottom: 0;
}

.env-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
}

.env-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.env-key {
    width: 180px;
    flex-shrink: 0;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 13px;
}

.env-eq {
    color: var(--text-tertiary);
    font-weight: 500;
}

.env-value {
    flex: 1;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 13px;
}

.modal-lg {
    max-width: 600px;
}
</style>

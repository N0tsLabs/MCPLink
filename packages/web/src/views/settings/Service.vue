<template>
    <div class="setting-page">
        <div class="page-header">
            <div>
                <h2>服务配置</h2>
                <p class="description">配置后端服务地址，你可以本地部署后端服务，然后将地址改为本地地址。</p>
            </div>
        </div>

        <div class="card">
            <div class="form-group">
                <label class="form-label">服务地址</label>
                <div class="input-row">
                    <input type="text" class="input" v-model="serverUrl" placeholder="http://localhost:3000" />
                    <button class="btn btn-secondary" @click="testConnection" :disabled="testing">
                        {{ testing ? '测试中...' : '测试连接' }}
                    </button>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">连接状态</label>
                <span class="tag" :class="store.isConnected ? 'tag-success' : 'tag-error'">
                    {{ store.isConnected ? '已连接' : '未连接' }}
                </span>
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" @click="saveSettings">保存配置</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { toast } from '@/composables/useToast'

const store = useAppStore()
const testing = ref(false)
const serverUrl = ref('')

onMounted(() => {
    serverUrl.value = store.serverUrl
})

async function testConnection() {
    testing.value = true
    store.setServerUrl(serverUrl.value)
    const connected = await store.checkConnection()
    testing.value = false

    if (connected) {
        toast.success('连接成功')
    } else {
        toast.error('连接失败，请检查服务地址')
    }
}

async function saveSettings() {
    store.setServerUrl(serverUrl.value)
    const connected = await store.checkConnection()

    if (connected) {
        toast.success('保存成功')
        store.initialize()
    } else {
        toast.warning('配置已保存，但无法连接到服务')
    }
}
</script>

<style scoped>
.setting-page {
    width: 100%;
}

.page-header {
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

.card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-bottom: 40px;
}

.input-row {
    display: flex;
    gap: 12px;
}

.input-row .input {
    flex: 1;
}

.form-actions {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border-light);
}
</style>

<template>
    <div class="setting-page">
        <div class="page-header">
            <div>
                <h2>系统提示词</h2>
                <p class="description">配置 AI 的系统提示词，指导 AI 如何理解和执行任务。</p>
            </div>
        </div>

        <div class="card">
            <div class="form-group">
                <label class="form-label">系统提示词</label>
                <textarea class="textarea" v-model="systemPrompt" placeholder="输入系统提示词..." rows="10"></textarea>
            </div>

            <div class="form-group">
                <label class="form-label">最大迭代次数</label>
                <div class="input-inline">
                    <input
                        type="number"
                        class="input"
                        v-model.number="maxIterations"
                        min="1"
                        max="50"
                        style="width: 100px"
                    />
                    <span class="input-suffix">次</span>
                </div>
                <p class="form-hint">AI 执行工具调用的最大循环次数，防止无限循环（建议 5-20）</p>
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
                    {{ saving ? '保存中...' : '保存' }}
                </button>
                <button class="btn btn-secondary" @click="resetToDefault">重置为默认</button>
            </div>
        </div>

        <div class="section">
            <h3>默认提示词参考</h3>
            <p class="section-desc">点击「重置为默认」可应用以下提示词</p>
            <div class="default-prompt-card">
                <pre>{{ defaultPrompt }}</pre>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/api'
import { toast } from '@/composables/useToast'

const store = useAppStore()
const saving = ref(false)
const systemPrompt = ref('')
const maxIterations = ref(10)
const defaultPrompt = ref('')

// 加载默认提示词
async function loadDefaultPrompt() {
    try {
        const { prompt } = await api.getDefaultPrompt()
        defaultPrompt.value = prompt
    } catch (error) {
        console.error('Failed to fetch default prompt:', error)
        defaultPrompt.value = '加载失败'
    }
}

onMounted(() => {
    systemPrompt.value = store.settings.systemPrompt || ''
    maxIterations.value = store.settings.maxIterations || 10

    // 如果已连接，立即加载；否则等待连接
    if (store.isConnected) {
        loadDefaultPrompt()
    }
})

// 监听连接状态，连接成功后加载默认提示词
watch(
    () => store.isConnected,
    (connected) => {
        if (connected && !defaultPrompt.value) {
            loadDefaultPrompt()
        }
    }
)

async function saveSettings() {
    saving.value = true
    try {
        await api.updateSettings({
            systemPrompt: systemPrompt.value,
            maxIterations: maxIterations.value,
        })
        toast.success('保存成功')
        store.fetchSettings()
    } catch (error) {
        toast.error('保存失败')
    } finally {
        saving.value = false
    }
}

function resetToDefault() {
    if (defaultPrompt.value) {
        systemPrompt.value = defaultPrompt.value
        toast.info('已重置为默认提示词，请点击保存')
    } else {
        toast.error('默认提示词加载失败，请刷新页面')
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

.input-inline {
    display: flex;
    align-items: center;
    gap: 8px;
}

.input-suffix {
    color: var(--text-tertiary);
    font-size: 14px;
}

.form-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border-light);
}

.section {
    margin-bottom: 32px;
}

.section h3 {
    margin-bottom: 6px;
    font-size: 16px;
    font-weight: 600;
}

.section-desc {
    color: var(--text-tertiary);
    font-size: 13px;
    margin-bottom: 16px;
}

.default-prompt-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 20px;
}

.default-prompt-card pre {
    white-space: pre-wrap;
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    font-family: inherit;
    line-height: 1.6;
}
</style>

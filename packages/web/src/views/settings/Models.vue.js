import { ref, reactive, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { api } from '@/api';
import { toast } from '@/composables/useToast';
const store = useAppStore();
const modalVisible = ref(false);
const editingChannel = ref(null);
const saving = ref(false);
const fetchingModels = ref(false);
const availableModels = ref([]);
const selectedModels = ref(new Set());
const manualModelInput = ref('');
const modelSearchQuery = ref('');
const channels = ref([]);
const filteredModels = computed(() => {
    if (!modelSearchQuery.value.trim())
        return availableModels.value;
    const query = modelSearchQuery.value.toLowerCase().trim();
    return availableModels.value.filter((m) => m.toLowerCase().includes(query));
});
const form = reactive({
    name: '',
    baseURL: '',
    apiKey: '',
    enabled: true,
});
const canSave = computed(() => {
    return form.name.trim() && form.baseURL.trim() && selectedModels.value.size > 0;
});
onMounted(() => {
    loadChannels();
});
// 从现有模型数据中构建渠道列表
async function loadChannels() {
    await store.fetchModels();
    // 按 baseURL 分组
    const channelMap = new Map();
    for (const model of store.models) {
        const key = `${model.baseURL}|${model.apiKey}`;
        if (!channelMap.has(key)) {
            channelMap.set(key, {
                id: model.channelId || model.id,
                name: getChannelName(model.baseURL),
                baseURL: model.baseURL,
                apiKey: model.apiKey,
                models: [],
                enabled: model.enabled,
                createdAt: Date.now(),
            });
        }
        const channel = channelMap.get(key);
        channel.models.push(model.model);
        // 只要有一个模型启用，渠道就启用
        if (model.enabled) {
            channel.enabled = true;
        }
    }
    channels.value = Array.from(channelMap.values());
}
function getChannelName(baseURL) {
    if (baseURL.includes('openai'))
        return 'OpenAI';
    if (baseURL.includes('anthropic'))
        return 'Claude';
    if (baseURL.includes('deepseek'))
        return 'DeepSeek';
    if (baseURL.includes('moonshot'))
        return 'Moonshot';
    if (baseURL.includes('zhipu'))
        return '智谱 AI';
    try {
        const url = new URL(baseURL);
        return url.hostname;
    }
    catch {
        return '自定义渠道';
    }
}
function showAddChannelModal() {
    editingChannel.value = null;
    form.name = '';
    form.baseURL = '';
    form.apiKey = '';
    form.enabled = true;
    availableModels.value = [];
    selectedModels.value.clear();
    manualModelInput.value = '';
    modelSearchQuery.value = '';
    modalVisible.value = true;
}
function editChannel(channel) {
    editingChannel.value = channel;
    form.name = channel.name;
    form.baseURL = channel.baseURL;
    form.apiKey = channel.apiKey;
    form.enabled = channel.enabled;
    availableModels.value = [];
    selectedModels.value = new Set(channel.models);
    manualModelInput.value = '';
    modelSearchQuery.value = '';
    modalVisible.value = true;
}
function closeModal() {
    modalVisible.value = false;
}
async function fetchModels() {
    if (!form.baseURL) {
        toast.warning('请先填写 Base URL');
        return;
    }
    fetchingModels.value = true;
    try {
        const result = await api.fetchRemoteModels(form.baseURL, form.apiKey);
        if (result.models && result.models.length > 0) {
            availableModels.value = result.models.sort();
            // 如果是编辑模式，保持已选模型
            if (!editingChannel.value) {
                // 新增模式：自动选择常用模型
                const commonModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude'];
                for (const m of result.models) {
                    if (commonModels.some((c) => m.toLowerCase().includes(c.toLowerCase()))) {
                        selectedModels.value.add(m);
                    }
                }
            }
            toast.success(`获取到 ${result.models.length} 个模型`);
        }
        else {
            toast.warning('未获取到模型列表，请手动输入');
        }
    }
    catch (error) {
        toast.error(`获取失败: ${error.message || '未知错误'}`);
    }
    finally {
        fetchingModels.value = false;
    }
}
function toggleModelSelection(model) {
    if (selectedModels.value.has(model)) {
        selectedModels.value.delete(model);
    }
    else {
        selectedModels.value.add(model);
    }
}
function selectAllModels() {
    for (const model of availableModels.value) {
        selectedModels.value.add(model);
    }
}
function clearSelectedModels() {
    selectedModels.value.clear();
}
function removeModel(model) {
    selectedModels.value.delete(model);
}
function addManualModels() {
    const input = manualModelInput.value.trim();
    if (!input)
        return;
    const models = input
        .split(/[,，\n]/)
        .map((m) => m.trim())
        .filter((m) => m);
    for (const model of models) {
        selectedModels.value.add(model);
    }
    manualModelInput.value = '';
}
async function saveChannel() {
    if (!canSave.value)
        return;
    saving.value = true;
    try {
        const models = Array.from(selectedModels.value);
        if (editingChannel.value) {
            // 编辑模式：删除旧模型，创建新模型
            // 先找出该渠道下的所有模型
            const oldModels = store.models.filter((m) => m.baseURL === editingChannel.value.baseURL && m.apiKey === editingChannel.value.apiKey);
            // 删除所有旧模型
            for (const m of oldModels) {
                await api.deleteModel(m.id);
            }
            // 创建新模型
            for (const modelId of models) {
                await api.createModel({
                    name: modelId,
                    model: modelId,
                    baseURL: form.baseURL,
                    apiKey: form.apiKey,
                    enabled: form.enabled,
                });
            }
            toast.success('渠道更新成功');
        }
        else {
            // 新增模式：批量创建模型
            for (const modelId of models) {
                await api.createModel({
                    name: modelId,
                    model: modelId,
                    baseURL: form.baseURL,
                    apiKey: form.apiKey,
                    enabled: form.enabled,
                });
            }
            toast.success(`成功创建渠道，包含 ${models.length} 个模型`);
        }
        closeModal();
        loadChannels();
    }
    catch (error) {
        toast.error(`保存失败: ${error.message || '未知错误'}`);
    }
    finally {
        saving.value = false;
    }
}
async function toggleChannel(channel) {
    try {
        // 切换该渠道下所有模型的启用状态
        const newEnabled = !channel.enabled;
        const channelModels = store.models.filter((m) => m.baseURL === channel.baseURL && m.apiKey === channel.apiKey);
        for (const m of channelModels) {
            if (m.enabled !== newEnabled) {
                await api.toggleModel(m.id);
            }
        }
        loadChannels();
    }
    catch (error) {
        toast.error('操作失败');
    }
}
async function deleteChannel(channel) {
    if (!confirm(`确定要删除渠道「${channel.name}」及其所有模型吗？`))
        return;
    try {
        // 删除该渠道下的所有模型
        const channelModels = store.models.filter((m) => m.baseURL === channel.baseURL && m.apiKey === channel.apiKey);
        for (const m of channelModels) {
            await api.deleteModel(m.id);
        }
        toast.success('渠道删除成功');
        loadChannels();
    }
    catch (error) {
        toast.error('删除失败');
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['remove-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label-row']} */ ;
/** @type {__VLS_StyleScopedClasses['select-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['select-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['model-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['model-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['model-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "setting-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "description" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.showAddChannelModal) },
    ...{ class: "btn btn-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "12",
    y1: "5",
    x2: "12",
    y2: "19",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "5",
    y1: "12",
    x2: "19",
    y2: "12",
});
if (__VLS_ctx.channels.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "channel-list" },
    });
    for (const [channel] of __VLS_getVForSourceType((__VLS_ctx.channels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (channel.id),
            ...{ class: "channel-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "channel-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "channel-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "channel-name" },
        });
        (channel.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "channel-model-count" },
        });
        (channel.models.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag" },
            ...{ class: (channel.enabled ? 'tag-success' : '') },
        });
        (channel.enabled ? '已启用' : '已停用');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "channel-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.channels.length > 0))
                        return;
                    __VLS_ctx.toggleChannel(channel);
                } },
            ...{ class: "switch" },
            ...{ class: ({ active: channel.enabled }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.channels.length > 0))
                        return;
                    __VLS_ctx.editChannel(channel);
                } },
            ...{ class: "btn btn-ghost btn-icon" },
            title: "编辑",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.channels.length > 0))
                        return;
                    __VLS_ctx.deleteChannel(channel);
                } },
            ...{ class: "btn btn-ghost btn-icon" },
            title: "删除",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
            points: "3 6 5 6 21 6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "channel-details" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "detail-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "detail-value truncate" },
        });
        (channel.baseURL);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "detail-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "model-tags" },
        });
        for (const [model] of __VLS_getVForSourceType((channel.models.slice(0, 5)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (model),
                ...{ class: "model-tag" },
            });
            (model);
        }
        if (channel.models.length > 5) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "model-tag more" },
            });
            (channel.models.length - 5);
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "empty-text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "empty-hint" },
    });
}
if (__VLS_ctx.modalVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "modal-overlay" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal modal-lg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "modal-title" },
    });
    (__VLS_ctx.editingChannel ? '编辑渠道' : '新增渠道');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "btn btn-ghost btn-icon" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "text",
        ...{ class: "input" },
        value: (__VLS_ctx.form.name),
        placeholder: "如: OpenAI、Claude、DeepSeek",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "text",
        ...{ class: "input" },
        value: (__VLS_ctx.form.baseURL),
        placeholder: "如: https://api.openai.com/v1",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "form-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "input-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "text",
        ...{ class: "input" },
        value: (__VLS_ctx.form.apiKey),
        placeholder: "sk-...",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.fetchModels) },
        ...{ class: "btn btn-secondary" },
        disabled: (__VLS_ctx.fetchingModels || !__VLS_ctx.form.baseURL),
    });
    if (__VLS_ctx.fetchingModels) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "spin" },
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M21 12a9 9 0 1 1-6.219-8.56",
        });
    }
    (__VLS_ctx.fetchingModels ? '获取中...' : '获取模型');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-label-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "select-actions" },
    });
    if (__VLS_ctx.availableModels.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.selectAllModels) },
            ...{ class: "btn btn-sm btn-ghost" },
        });
    }
    if (__VLS_ctx.selectedModels.size > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearSelectedModels) },
            ...{ class: "btn btn-sm btn-ghost btn-danger" },
        });
    }
    if (__VLS_ctx.selectedModels.size > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "selected-models" },
        });
        for (const [model] of __VLS_getVForSourceType((__VLS_ctx.selectedModels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (model),
                ...{ class: "selected-model-tag" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (model);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.modalVisible))
                            return;
                        if (!(__VLS_ctx.selectedModels.size > 0))
                            return;
                        __VLS_ctx.removeModel(model);
                    } },
                ...{ class: "remove-btn" },
            });
        }
    }
    if (__VLS_ctx.availableModels.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "model-selection-area" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-box" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "text",
            ...{ class: "input input-sm" },
            value: (__VLS_ctx.modelSearchQuery),
            placeholder: "搜索模型...",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "model-select-list" },
        });
        for (const [model] of __VLS_getVForSourceType((__VLS_ctx.filteredModels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (model),
                ...{ class: "model-checkbox" },
                ...{ class: ({ selected: __VLS_ctx.selectedModels.has(model) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.modalVisible))
                            return;
                        if (!(__VLS_ctx.availableModels.length > 0))
                            return;
                        __VLS_ctx.toggleModelSelection(model);
                    } },
                type: "checkbox",
                checked: (__VLS_ctx.selectedModels.has(model)),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "model-id" },
            });
            (model);
        }
        if (__VLS_ctx.filteredModels.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "no-match" },
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "manual-input-section" },
    });
    if (__VLS_ctx.availableModels.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-divider" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "form-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "input-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeydown: (__VLS_ctx.addManualModels) },
        type: "text",
        ...{ class: "input" },
        value: (__VLS_ctx.manualModelInput),
        placeholder: "gpt-4o, gpt-4o-mini",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addManualModels) },
        ...{ class: "btn btn-secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.modalVisible))
                    return;
                __VLS_ctx.form.enabled = !__VLS_ctx.form.enabled;
            } },
        ...{ class: "switch" },
        ...{ class: ({ active: __VLS_ctx.form.enabled }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "btn btn-secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveChannel) },
        ...{ class: "btn btn-primary" },
        disabled: (__VLS_ctx.saving || !__VLS_ctx.canSave),
    });
    (__VLS_ctx.saving ? '保存中...' : __VLS_ctx.editingChannel ? '保存' : '创建渠道');
}
/** @type {__VLS_StyleScopedClasses['setting-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['description']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-list']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-card']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-info']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-name']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-model-count']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-details']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-value']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['model-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['more']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-title']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['select-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-models']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-model-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['remove-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['model-selection-area']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['input-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['model-select-list']} */ ;
/** @type {__VLS_StyleScopedClasses['model-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['model-id']} */ ;
/** @type {__VLS_StyleScopedClasses['no-match']} */ ;
/** @type {__VLS_StyleScopedClasses['manual-input-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            modalVisible: modalVisible,
            editingChannel: editingChannel,
            saving: saving,
            fetchingModels: fetchingModels,
            availableModels: availableModels,
            selectedModels: selectedModels,
            manualModelInput: manualModelInput,
            modelSearchQuery: modelSearchQuery,
            channels: channels,
            filteredModels: filteredModels,
            form: form,
            canSave: canSave,
            showAddChannelModal: showAddChannelModal,
            editChannel: editChannel,
            closeModal: closeModal,
            fetchModels: fetchModels,
            toggleModelSelection: toggleModelSelection,
            selectAllModels: selectAllModels,
            clearSelectedModels: clearSelectedModels,
            removeModel: removeModel,
            addManualModels: addManualModels,
            saveChannel: saveChannel,
            toggleChannel: toggleChannel,
            deleteChannel: deleteChannel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

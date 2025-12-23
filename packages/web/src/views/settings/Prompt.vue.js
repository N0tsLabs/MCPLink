import { ref, onMounted, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { api } from '@/api';
import { toast } from '@/composables/useToast';
const store = useAppStore();
const saving = ref(false);
const systemPrompt = ref('');
const maxIterations = ref(10);
const defaultPrompt = ref('');
// 加载默认提示词
async function loadDefaultPrompt() {
    try {
        const { prompt } = await api.getDefaultPrompt();
        defaultPrompt.value = prompt;
    }
    catch (error) {
        console.error('Failed to fetch default prompt:', error);
        defaultPrompt.value = '加载失败';
    }
}
onMounted(() => {
    systemPrompt.value = store.settings.systemPrompt || '';
    maxIterations.value = store.settings.maxIterations || 10;
    // 如果已连接，立即加载；否则等待连接
    if (store.isConnected) {
        loadDefaultPrompt();
    }
});
// 监听连接状态，连接成功后加载默认提示词
watch(() => store.isConnected, (connected) => {
    if (connected && !defaultPrompt.value) {
        loadDefaultPrompt();
    }
});
async function saveSettings() {
    saving.value = true;
    try {
        await api.updateSettings({
            systemPrompt: systemPrompt.value,
            maxIterations: maxIterations.value,
        });
        toast.success('保存成功');
        store.fetchSettings();
    }
    catch (error) {
        toast.error('保存失败');
    }
    finally {
        saving.value = false;
    }
}
function resetToDefault() {
    if (defaultPrompt.value) {
        systemPrompt.value = defaultPrompt.value;
        toast.info('已重置为默认提示词，请点击保存');
    }
    else {
        toast.error('默认提示词加载失败，请刷新页面');
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section']} */ ;
/** @type {__VLS_StyleScopedClasses['default-prompt-card']} */ ;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
    ...{ class: "textarea" },
    value: (__VLS_ctx.systemPrompt),
    placeholder: "输入你的自定义提示词，如角色设定、token 等...",
    rows: "10",
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
    ...{ class: "input-inline" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "number",
    ...{ class: "input" },
    min: "1",
    max: "50",
    ...{ style: {} },
});
(__VLS_ctx.maxIterations);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "input-suffix" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "form-hint" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.saveSettings) },
    ...{ class: "btn btn-primary" },
    disabled: (__VLS_ctx.saving),
});
(__VLS_ctx.saving ? '保存中...' : '保存');
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.resetToDefault) },
    ...{ class: "btn btn-secondary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "section-desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "default-prompt-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
(__VLS_ctx.defaultPrompt);
/** @type {__VLS_StyleScopedClasses['setting-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['description']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['input-suffix']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['default-prompt-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            saving: saving,
            systemPrompt: systemPrompt,
            maxIterations: maxIterations,
            defaultPrompt: defaultPrompt,
            saveSettings: saveSettings,
            resetToDefault: resetToDefault,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

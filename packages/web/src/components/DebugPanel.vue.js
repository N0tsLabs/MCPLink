import { ref, nextTick, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const isCollapsed = ref(false);
const logContainer = ref(null);
function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value;
}
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}
function formatData(data) {
    if (typeof data === 'string') {
        return data.length > 500 ? data.slice(0, 500) + '...' : data;
    }
    try {
        const str = JSON.stringify(data, null, 2);
        return str.length > 500 ? str.slice(0, 500) + '...' : str;
    }
    catch {
        return String(data);
    }
}
function copyLogs() {
    const text = props.logs.map(log => {
        let line = `[${formatTime(log.timestamp)}] [${log.tag}] ${log.message}`;
        if (log.data) {
            line += '\n  Data: ' + (typeof log.data === 'string' ? log.data : JSON.stringify(log.data));
        }
        return line;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        alert('日志已复制到剪贴板');
    }).catch(() => {
        // 备用方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('日志已复制到剪贴板');
    });
}
function clearLogs() {
    emit('clear');
}
// 自动滚动到底部
watch(() => props.logs.length, () => {
    nextTick(() => {
        if (logContainer.value) {
            logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
    });
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['debug-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-header']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['log-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['log-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['log-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['log-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['event']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['warn']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-content']} */ ;
/** @type {__VLS_StyleScopedClasses['log-data']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-content']} */ ;
/** @type {__VLS_StyleScopedClasses['log-data']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-content']} */ ;
/** @type {__VLS_StyleScopedClasses['log-data']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "debug-panel" },
    ...{ class: ({ collapsed: __VLS_ctx.isCollapsed }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onClick: (__VLS_ctx.toggleCollapse) },
    ...{ class: "debug-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "debug-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "debug-icon" },
});
if (__VLS_ctx.logs.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "log-count" },
    });
    (__VLS_ctx.logs.length);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "debug-actions" },
});
if (!__VLS_ctx.isCollapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.copyLogs) },
        ...{ class: "action-btn" },
        title: "复制日志",
    });
}
if (!__VLS_ctx.isCollapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearLogs) },
        ...{ class: "action-btn" },
        title: "清空日志",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "collapse-icon" },
});
(__VLS_ctx.isCollapsed ? '▲' : '▼');
if (!__VLS_ctx.isCollapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "debug-content" },
        ref: "logContainer",
    });
    /** @type {typeof __VLS_ctx.logContainer} */ ;
    if (__VLS_ctx.logs.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-logs" },
        });
    }
    for (const [log, index] of __VLS_getVForSourceType((__VLS_ctx.logs))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (index),
            ...{ class: "log-entry" },
            ...{ class: (log.type) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-time" },
        });
        (__VLS_ctx.formatTime(log.timestamp));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-tag" },
            ...{ class: (log.type) },
        });
        (log.tag);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-message" },
        });
        (log.message);
        if (log.data) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                ...{ class: "log-data" },
            });
            (__VLS_ctx.formatData(log.data));
        }
    }
}
/** @type {__VLS_StyleScopedClasses['debug-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-header']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-title']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['collapse-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-content']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-logs']} */ ;
/** @type {__VLS_StyleScopedClasses['log-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['log-time']} */ ;
/** @type {__VLS_StyleScopedClasses['log-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['log-message']} */ ;
/** @type {__VLS_StyleScopedClasses['log-data']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            isCollapsed: isCollapsed,
            logContainer: logContainer,
            toggleCollapse: toggleCollapse,
            formatTime: formatTime,
            formatData: formatData,
            copyLogs: copyLogs,
            clearLogs: clearLogs,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */

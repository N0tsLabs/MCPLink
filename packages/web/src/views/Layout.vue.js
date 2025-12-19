import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { api } from '@/api';
const route = useRoute();
const store = useAppStore();
const selectedModelId = ref(null);
// 标题编辑相关
const editingConversationId = ref(null);
const editingTitle = ref('');
const editInputRef = ref(null);
// 判断是否在设置页面
const isSettingsPage = computed(() => {
    return route.path.startsWith('/settings');
});
// 同步模型选择
watch(() => store.currentModelId, (id) => {
    selectedModelId.value = id;
}, { immediate: true });
watch(selectedModelId, (id) => {
    if (id) {
        store.setCurrentModel(id);
    }
});
// 新建对话
async function handleNewChat() {
    await store.createConversation();
}
// 删除对话
async function handleDeleteConversation(id) {
    if (confirm('确定要删除这个会话吗？')) {
        await store.deleteConversation(id);
    }
}
// 开始编辑标题
function startEditTitle(convId, currentTitle) {
    editingConversationId.value = convId;
    editingTitle.value = currentTitle;
    nextTick(() => {
        if (editInputRef.value) {
            editInputRef.value.focus();
            editInputRef.value.select();
        }
    });
}
// 保存标题
async function saveTitle(convId) {
    if (!editingConversationId.value)
        return;
    const newTitle = editingTitle.value.trim();
    if (newTitle && newTitle !== '') {
        try {
            await api.updateConversation(convId, { title: newTitle });
            store.updateConversationTitle(convId, newTitle);
        }
        catch (error) {
            console.error('Failed to update title:', error);
        }
    }
    editingConversationId.value = null;
    editingTitle.value = '';
}
// 取消编辑
function cancelEditTitle() {
    editingConversationId.value = null;
    editingTitle.value = '';
}
onMounted(() => {
    store.initialize();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-item']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-item']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-item']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-select']} */ ;
/** @type {__VLS_StyleScopedClasses['connection-status']} */ ;
/** @type {__VLS_StyleScopedClasses['content']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "layout" },
    ...{ class: ({ 'settings-mode': __VLS_ctx.isSettingsPage }) },
});
if (!__VLS_ctx.isSettingsPage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "sidebar" },
        ...{ class: ({ collapsed: !__VLS_ctx.store.sidebarOpen }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sidebar-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.store.toggleSidebar) },
        ...{ class: "btn btn-ghost btn-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect, __VLS_intrinsicElements.rect)({
        x: "3",
        y: "3",
        width: "18",
        height: "18",
        rx: "2",
        ry: "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
        x1: "9",
        y1: "3",
        x2: "9",
        y2: "21",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleNewChat) },
        ...{ class: "btn btn-ghost btn-icon" },
        title: "新建对话",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "20",
        height: "20",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sidebar-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "conversation-list" },
    });
    for (const [conv] of __VLS_getVForSourceType((__VLS_ctx.store.conversations))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isSettingsPage))
                        return;
                    __VLS_ctx.store.setCurrentConversation(conv.id);
                } },
            key: (conv.id),
            ...{ class: "conversation-item" },
            ...{ class: ({ active: conv.id === __VLS_ctx.store.currentConversationId }) },
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
            d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
        });
        if (__VLS_ctx.editingConversationId === conv.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onInput: (...[$event]) => {
                        if (!(!__VLS_ctx.isSettingsPage))
                            return;
                        if (!(__VLS_ctx.editingConversationId === conv.id))
                            return;
                        __VLS_ctx.editingTitle = $event.target.value;
                    } },
                ...{ onKeydown: (...[$event]) => {
                        if (!(!__VLS_ctx.isSettingsPage))
                            return;
                        if (!(__VLS_ctx.editingConversationId === conv.id))
                            return;
                        __VLS_ctx.saveTitle(conv.id);
                    } },
                ...{ onKeydown: (__VLS_ctx.cancelEditTitle) },
                ...{ onBlur: (...[$event]) => {
                        if (!(!__VLS_ctx.isSettingsPage))
                            return;
                        if (!(__VLS_ctx.editingConversationId === conv.id))
                            return;
                        __VLS_ctx.saveTitle(conv.id);
                    } },
                ...{ onClick: () => { } },
                ref: "editInputRef",
                type: "text",
                ...{ class: "conversation-title-input" },
                value: (__VLS_ctx.editingTitle),
            });
            /** @type {typeof __VLS_ctx.editInputRef} */ ;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ onDblclick: (...[$event]) => {
                        if (!(!__VLS_ctx.isSettingsPage))
                            return;
                        if (!!(__VLS_ctx.editingConversationId === conv.id))
                            return;
                        __VLS_ctx.startEditTitle(conv.id, conv.title);
                    } },
                ...{ class: "conversation-title" },
            });
            (conv.title);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isSettingsPage))
                        return;
                    __VLS_ctx.handleDeleteConversation(conv.id);
                } },
            ...{ class: "delete-btn" },
            title: "删除",
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
            points: "3 6 5 6 21 6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sidebar-footer" },
    });
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        to: "/settings/service",
        ...{ class: "sidebar-menu-item" },
    }));
    const __VLS_2 = __VLS_1({
        to: "/settings/service",
        ...{ class: "sidebar-menu-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "main" },
});
if (!__VLS_ctx.isSettingsPage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "header" },
    });
    if (!__VLS_ctx.store.sidebarOpen) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.store.toggleSidebar) },
            ...{ class: "btn btn-ghost btn-icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            xmlns: "http://www.w3.org/2000/svg",
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.rect, __VLS_intrinsicElements.rect)({
            x: "3",
            y: "3",
            width: "18",
            height: "18",
            rx: "2",
            ry: "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "9",
            y1: "3",
            x2: "9",
            y2: "21",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "model-selector" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.selectedModelId),
        ...{ class: "model-select" },
    });
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.store.enabledModels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (model.id),
            value: (model.id),
        });
        (model.name);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "connection-status" },
        ...{ class: ({ connected: __VLS_ctx.store.isConnected }) },
    });
    (__VLS_ctx.store.isConnected ? '已连接' : '未连接');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content" },
    ...{ class: ({ 'settings-content': __VLS_ctx.isSettingsPage }) },
});
const __VLS_4 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.routerView, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-header']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-content']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-item']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-title-input']} */ ;
/** @type {__VLS_StyleScopedClasses['conversation-title']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['main']} */ ;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['header-center']} */ ;
/** @type {__VLS_StyleScopedClasses['model-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['model-select']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['connection-status']} */ ;
/** @type {__VLS_StyleScopedClasses['content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            store: store,
            selectedModelId: selectedModelId,
            editingConversationId: editingConversationId,
            editingTitle: editingTitle,
            editInputRef: editInputRef,
            isSettingsPage: isSettingsPage,
            handleNewChat: handleNewChat,
            handleDeleteConversation: handleDeleteConversation,
            startEditTitle: startEditTitle,
            saveTitle: saveTitle,
            cancelEditTitle: cancelEditTitle,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

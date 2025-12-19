import { useToast } from '@/composables/useToast';
const { toasts, pauseTimer, resumeTimer, removeToast } = useToast();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-close']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.TransitionGroup;
/** @type {[typeof __VLS_components.TransitionGroup, typeof __VLS_components.TransitionGroup, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "toast",
    tag: "div",
    ...{ class: "toast-container" },
}));
const __VLS_6 = __VLS_5({
    name: "toast",
    tag: "div",
    ...{ class: "toast-container" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_8 = {};
__VLS_7.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.toasts))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMouseenter: (...[$event]) => {
                __VLS_ctx.pauseTimer(item.id);
            } },
        ...{ onMouseleave: (...[$event]) => {
                __VLS_ctx.resumeTimer(item.id);
            } },
        key: (item.id),
        ...{ class: "toast" },
        ...{ class: ([`toast-${item.type}`]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toast-icon" },
    });
    if (item.type === 'success') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            xmlns: "http://www.w3.org/2000/svg",
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M22 11.08V12a10 10 0 1 1-5.93-9.14",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
            points: "22 4 12 14.01 9 11.01",
        });
    }
    else if (item.type === 'error') {
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
            r: "10",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "15",
            y1: "9",
            x2: "9",
            y2: "15",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "9",
            y1: "9",
            x2: "15",
            y2: "15",
        });
    }
    else if (item.type === 'warning') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            xmlns: "http://www.w3.org/2000/svg",
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
            d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "9",
            x2: "12",
            y2: "13",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "17",
            x2: "12.01",
            y2: "17",
        });
    }
    else {
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
            r: "10",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "16",
            x2: "12",
            y2: "12",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "8",
            x2: "12.01",
            y2: "8",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "toast-message" },
    });
    (item.message);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.removeToast(item.id);
            } },
        ...{ class: "toast-close" },
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
}
var __VLS_7;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['toast-container']} */ ;
/** @type {__VLS_StyleScopedClasses['toast']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-message']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-close']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            toasts: toasts,
            pauseTimer: pauseTimer,
            resumeTimer: resumeTimer,
            removeToast: removeToast,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

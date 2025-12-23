import { ref } from 'vue';
const TOAST_DURATION = 3000;
let idCounter = 0;
// 全局状态
const toasts = ref([]);
function addToast(message, type = 'info') {
    const id = ++idCounter;
    const toast = {
        id,
        message,
        type,
        startTime: Date.now(),
        remaining: TOAST_DURATION,
    };
    toasts.value.push(toast);
    startTimer(toast);
    return id;
}
function startTimer(toast) {
    toast.startTime = Date.now();
    toast.timer = setTimeout(() => {
        removeToast(toast.id);
    }, toast.remaining);
}
function pauseTimer(id) {
    const toast = toasts.value.find((t) => t.id === id);
    if (toast && toast.timer) {
        clearTimeout(toast.timer);
        toast.remaining = toast.remaining - (Date.now() - toast.startTime);
        toast.paused = true;
    }
}
function resumeTimer(id) {
    const toast = toasts.value.find((t) => t.id === id);
    if (toast && toast.paused) {
        toast.paused = false;
        startTimer(toast);
    }
}
function removeToast(id) {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index !== -1) {
        const toast = toasts.value[index];
        if (toast.timer) {
            clearTimeout(toast.timer);
        }
        toasts.value.splice(index, 1);
    }
}
export const toast = {
    success: (message) => addToast(message, 'success'),
    error: (message) => addToast(message, 'error'),
    warning: (message) => addToast(message, 'warning'),
    info: (message) => addToast(message, 'info'),
};
export function useToast() {
    return {
        toasts,
        toast,
        pauseTimer,
        resumeTimer,
        removeToast,
    };
}

import { ref, reactive } from 'vue'

export interface ToastItem {
    id: number
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
    timer?: ReturnType<typeof setTimeout>
    paused?: boolean
    remaining?: number
    startTime?: number
}

const TOAST_DURATION = 3000
let idCounter = 0

// 全局状态
const toasts = ref<ToastItem[]>([])

function addToast(message: string, type: ToastItem['type'] = 'info') {
    const id = ++idCounter
    const toast: ToastItem = {
        id,
        message,
        type,
        startTime: Date.now(),
        remaining: TOAST_DURATION,
    }

    toasts.value.push(toast)
    startTimer(toast)

    return id
}

function startTimer(toast: ToastItem) {
    toast.startTime = Date.now()
    toast.timer = setTimeout(() => {
        removeToast(toast.id)
    }, toast.remaining)
}

function pauseTimer(id: number) {
    const toast = toasts.value.find((t) => t.id === id)
    if (toast && toast.timer) {
        clearTimeout(toast.timer)
        toast.remaining = toast.remaining! - (Date.now() - toast.startTime!)
        toast.paused = true
    }
}

function resumeTimer(id: number) {
    const toast = toasts.value.find((t) => t.id === id)
    if (toast && toast.paused) {
        toast.paused = false
        startTimer(toast)
    }
}

function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
        const toast = toasts.value[index]
        if (toast.timer) {
            clearTimeout(toast.timer)
        }
        toasts.value.splice(index, 1)
    }
}

export const toast = {
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    warning: (message: string) => addToast(message, 'warning'),
    info: (message: string) => addToast(message, 'info'),
}

export function useToast() {
    return {
        toasts,
        toast,
        pauseTimer,
        resumeTimer,
        removeToast,
    }
}

<template>
    <Teleport to="body">
        <TransitionGroup name="toast" tag="div" class="toast-container">
            <div
                v-for="item in toasts"
                :key="item.id"
                class="toast"
                :class="[`toast-${item.type}`]"
                @mouseenter="pauseTimer(item.id)"
                @mouseleave="resumeTimer(item.id)"
            >
                <div class="toast-icon">
                    <svg
                        v-if="item.type === 'success'"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <svg
                        v-else-if="item.type === 'error'"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <svg
                        v-else-if="item.type === 'warning'"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                        ></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </div>
                <span class="toast-message">{{ item.message }}</span>
                <button class="toast-close" @click="removeToast(item.id)">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
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
        </TransitionGroup>
    </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, pauseTimer, resumeTimer, removeToast } = useToast()
</script>

<style scoped>
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

.toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 280px;
    max-width: 400px;
    pointer-events: auto;
}

.toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toast-success .toast-icon {
    color: var(--success-color);
}

.toast-error .toast-icon {
    color: var(--error-color);
}

.toast-warning .toast-icon {
    color: var(--warning-color);
}

.toast-info .toast-icon {
    color: var(--accent-color);
}

.toast-message {
    flex: 1;
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.4;
}

.toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
}

.toast-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

/* 过渡动画 */
.toast-enter-active {
    animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
    animation: toast-out 0.3s ease-in;
}

.toast-move {
    transition: transform 0.3s ease;
}

@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateX(100%);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes toast-out {
    from {
        opacity: 1;
        transform: translateX(0);
    }
    to {
        opacity: 0;
        transform: translateX(100%);
    }
}
</style>

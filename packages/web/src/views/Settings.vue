<template>
    <div class="settings">
        <!-- 设置侧边栏 -->
        <aside class="settings-sidebar">
            <router-link to="/" class="back-link">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>返回对话</span>
            </router-link>

            <nav class="settings-nav">
                <router-link to="/settings/service" class="nav-item" :class="{ active: isActive('/settings/service') }">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    服务配置
                </router-link>
                <router-link to="/settings/models" class="nav-item" :class="{ active: isActive('/settings/models') }">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                        <rect x="9" y="9" width="6" height="6"></rect>
                        <line x1="9" y1="1" x2="9" y2="4"></line>
                        <line x1="15" y1="1" x2="15" y2="4"></line>
                        <line x1="9" y1="20" x2="9" y2="23"></line>
                        <line x1="15" y1="20" x2="15" y2="23"></line>
                        <line x1="20" y1="9" x2="23" y2="9"></line>
                        <line x1="20" y1="14" x2="23" y2="14"></line>
                        <line x1="1" y1="9" x2="4" y2="9"></line>
                        <line x1="1" y1="14" x2="4" y2="14"></line>
                    </svg>
                    模型管理
                </router-link>
                <router-link to="/settings/mcp" class="nav-item" :class="{ active: isActive('/settings/mcp') }">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                        ></path>
                    </svg>
                    MCP 工具
                </router-link>
                <router-link to="/settings/prompt" class="nav-item" :class="{ active: isActive('/settings/prompt') }">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    系统提示词
                </router-link>
            </nav>
        </aside>

        <!-- 设置内容区 -->
        <main class="settings-main">
            <div class="settings-content">
                <router-view />

                <!-- 默认显示欢迎页 -->
                <div v-if="isSettingsRoot" class="settings-welcome">
                    <div class="welcome-icon">⚙️</div>
                    <h2>设置</h2>
                    <p>选择左侧菜单进行配置</p>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const isSettingsRoot = computed(() => route.path === '/settings')

function isActive(path: string) {
    return route.path === path || route.path.startsWith(path + '/')
}
</script>

<style scoped>
.settings {
    display: flex;
    height: 100%;
    background: var(--bg-primary);
}

.settings-sidebar {
    width: 240px;
    min-width: 240px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    padding: 16px;
}

.back-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--radius-md);
    margin-bottom: 20px;
    transition: all var(--transition-fast);
    font-weight: 500;
}

.back-link:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    text-decoration: none;
}

.settings-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    font-size: 14px;
}

.nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    text-decoration: none;
}

.nav-item.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.settings-main {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-primary);
}

.settings-content {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 32px;
}

.settings-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    color: var(--text-tertiary);
    text-align: center;
}

.welcome-icon {
    font-size: 56px;
    margin-bottom: 20px;
}

.settings-welcome h2 {
    margin-bottom: 8px;
    font-size: 24px;
    color: var(--text-secondary);
}

.settings-welcome p {
    font-size: 15px;
}
</style>

import { createRouter, createWebHistory } from 'vue-router';
const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Layout',
            component: () => import('@/views/Layout.vue'),
            children: [
                {
                    path: '',
                    name: 'Chat',
                    component: () => import('@/views/Chat.vue'),
                },
                {
                    path: 'settings',
                    name: 'Settings',
                    component: () => import('@/views/Settings.vue'),
                    children: [
                        {
                            path: 'service',
                            name: 'SettingsService',
                            component: () => import('@/views/settings/Service.vue'),
                        },
                        {
                            path: 'models',
                            name: 'SettingsModels',
                            component: () => import('@/views/settings/Models.vue'),
                        },
                        {
                            path: 'mcp',
                            name: 'SettingsMCP',
                            component: () => import('@/views/settings/MCP.vue'),
                        },
                        {
                            path: 'prompt',
                            name: 'SettingsPrompt',
                            component: () => import('@/views/settings/Prompt.vue'),
                        },
                    ],
                },
            ],
        },
    ],
});
export default router;

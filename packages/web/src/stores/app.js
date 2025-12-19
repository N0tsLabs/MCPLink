import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { api } from '@/api';
export const useAppStore = defineStore('app', () => {
    // 状态
    const models = ref([]);
    const mcpServers = ref([]);
    const conversations = ref([]);
    const settings = ref({});
    const currentConversationId = ref(null);
    const currentModelId = ref(localStorage.getItem('currentModelId'));
    const serverUrl = ref(localStorage.getItem('serverUrl') || 'http://localhost:3000');
    const isConnected = ref(false);
    const sidebarOpen = ref(true);
    const theme = ref(localStorage.getItem('theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    // 工具相关状态
    const allTools = ref([]);
    // 从 localStorage 恢复选中的工具，空表示全选
    const savedToolNames = localStorage.getItem('selectedToolNames');
    const selectedToolNames = ref(savedToolNames ? JSON.parse(savedToolNames) : []);
    // 监听主题变化并应用
    watch(theme, (newTheme) => {
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }, { immediate: true });
    // 监听模型选择变化并保存
    watch(currentModelId, (newModelId) => {
        if (newModelId) {
            localStorage.setItem('currentModelId', newModelId);
        }
        else {
            localStorage.removeItem('currentModelId');
        }
    });
    // 监听工具选择变化并保存
    watch(selectedToolNames, (newTools) => {
        localStorage.setItem('selectedToolNames', JSON.stringify(newTools));
    }, { deep: true });
    // 计算属性
    const enabledModels = computed(() => models.value.filter((m) => m.enabled));
    const currentModel = computed(() => models.value.find((m) => m.id === currentModelId.value));
    const currentConversation = computed(() => conversations.value.find((c) => c.id === currentConversationId.value));
    // 启用的 MCP 服务器
    const enabledMCPServers = computed(() => mcpServers.value.filter((s) => s.enabled));
    // 可用的工具（来自启用的 MCP 服务器）
    const availableTools = computed(() => {
        const tools = [];
        for (const server of enabledMCPServers.value) {
            if (server.tools) {
                tools.push(...server.tools);
            }
        }
        return tools;
    });
    // 当前选中的工具（空数组表示全选）
    const activeTools = computed(() => {
        if (selectedToolNames.value.length === 0) {
            return availableTools.value.map((t) => t.name);
        }
        return selectedToolNames.value;
    });
    // 是否全选工具
    const isAllToolsSelected = computed(() => {
        return selectedToolNames.value.length === 0 || selectedToolNames.value.length === availableTools.value.length;
    });
    // 模型相关
    async function fetchModels() {
        try {
            const data = await api.getModels();
            models.value = data.models;
            // 验证保存的模型 ID 是否还有效
            if (currentModelId.value) {
                const savedModel = enabledModels.value.find((m) => m.id === currentModelId.value);
                if (!savedModel) {
                    // 保存的模型不存在或未启用，选择第一个启用的
                    currentModelId.value = enabledModels.value.length > 0 ? enabledModels.value[0].id : null;
                }
            }
            else if (enabledModels.value.length > 0) {
                // 如果没有选择模型，选择第一个启用的
                currentModelId.value = enabledModels.value[0].id;
            }
        }
        catch (error) {
            console.error('Failed to fetch models:', error);
        }
    }
    function setCurrentModel(id) {
        currentModelId.value = id;
    }
    // MCP 服务器相关
    async function fetchMCPServers() {
        try {
            const data = await api.getMCPServers();
            mcpServers.value = data.servers;
            // 刷新可用工具列表
            await fetchAllTools();
        }
        catch (error) {
            console.error('Failed to fetch MCP servers:', error);
        }
    }
    // 获取所有可用工具
    async function fetchAllTools() {
        try {
            const data = await api.getAllTools();
            allTools.value = data.tools;
        }
        catch (error) {
            console.error('Failed to fetch tools:', error);
            allTools.value = [];
        }
    }
    // 选择/取消选择工具
    function toggleTool(toolName) {
        const index = selectedToolNames.value.indexOf(toolName);
        if (index === -1) {
            // 如果当前是全选状态，先设置为只选中这个工具之外的所有工具
            if (selectedToolNames.value.length === 0) {
                selectedToolNames.value = availableTools.value.map((t) => t.name).filter((n) => n !== toolName);
            }
            else {
                selectedToolNames.value.push(toolName);
            }
        }
        else {
            selectedToolNames.value.splice(index, 1);
        }
    }
    // 全选/取消全选工具
    function toggleAllTools() {
        if (isAllToolsSelected.value) {
            selectedToolNames.value = [];
        }
        else {
            selectedToolNames.value = [];
        }
    }
    // 设置选中的工具
    function setSelectedTools(toolNames) {
        selectedToolNames.value = toolNames;
    }
    // 清空选中（恢复全选）
    function clearSelectedTools() {
        selectedToolNames.value = [];
    }
    // 会话相关
    async function fetchConversations() {
        try {
            const data = await api.getConversations();
            conversations.value = data.conversations;
        }
        catch (error) {
            console.error('Failed to fetch conversations:', error);
        }
    }
    async function createConversation() {
        const data = await api.createConversation({
            title: '新对话',
            modelId: currentModelId.value || undefined,
        });
        conversations.value.unshift(data.conversation);
        currentConversationId.value = data.conversation.id;
        return data.conversation;
    }
    async function deleteConversation(id) {
        await api.deleteConversation(id);
        conversations.value = conversations.value.filter((c) => c.id !== id);
        if (currentConversationId.value === id) {
            currentConversationId.value = conversations.value[0]?.id || null;
        }
    }
    function setCurrentConversation(id) {
        currentConversationId.value = id;
    }
    function updateConversationTitle(id, title) {
        const conv = conversations.value.find((c) => c.id === id);
        if (conv) {
            conv.title = title;
        }
    }
    // 设置相关
    async function fetchSettings() {
        try {
            const data = await api.getSettings();
            settings.value = data.settings;
        }
        catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    }
    // 服务连接
    function setServerUrl(url) {
        serverUrl.value = url;
        localStorage.setItem('serverUrl', url);
        api.setBaseUrl(url);
    }
    async function checkConnection() {
        try {
            await api.healthCheck();
            isConnected.value = true;
            return true;
        }
        catch {
            isConnected.value = false;
            return false;
        }
    }
    // 侧边栏
    function toggleSidebar() {
        sidebarOpen.value = !sidebarOpen.value;
    }
    // 主题切换
    function toggleTheme() {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
    }
    function setTheme(newTheme) {
        theme.value = newTheme;
    }
    // 初始化
    async function initialize() {
        api.setBaseUrl(serverUrl.value);
        const connected = await checkConnection();
        if (connected) {
            await Promise.all([fetchModels(), fetchMCPServers(), fetchConversations(), fetchSettings()]);
        }
    }
    return {
        // 状态
        models,
        mcpServers,
        conversations,
        settings,
        currentConversationId,
        currentModelId,
        serverUrl,
        isConnected,
        sidebarOpen,
        theme,
        allTools,
        selectedToolNames,
        // 计算属性
        enabledModels,
        currentModel,
        currentConversation,
        enabledMCPServers,
        availableTools,
        activeTools,
        isAllToolsSelected,
        // 方法
        fetchModels,
        setCurrentModel,
        fetchMCPServers,
        fetchAllTools,
        toggleTool,
        toggleAllTools,
        setSelectedTools,
        clearSelectedTools,
        fetchConversations,
        createConversation,
        deleteConversation,
        setCurrentConversation,
        updateConversationTitle,
        fetchSettings,
        setServerUrl,
        checkConnection,
        toggleSidebar,
        toggleTheme,
        setTheme,
        initialize,
    };
});

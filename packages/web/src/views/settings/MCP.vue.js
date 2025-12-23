import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { api } from '@/api';
import { toast } from '@/composables/useToast';
const store = useAppStore();
const viewMode = ref('list');
const modalVisible = ref(false);
const editingServer = ref(null);
const saving = ref(false);
const jsonSaving = ref(false);
const serverLoading = ref({});
const expandedServers = ref(new Set());
const jsonConfig = ref('');
const jsonError = ref('');
let monacoEditor = null;
// Monaco Editor 配置
const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    formatOnPaste: true,
    formatOnType: true,
};
const form = reactive({
    name: '',
    type: 'stdio',
    command: '',
    argsStr: '',
    url: '',
    enabled: true,
    envVars: [],
});
function getStatusClass(status) {
    switch (status) {
        case 'running':
            return 'tag-success';
        case 'starting':
            return 'tag-warning';
        case 'error':
            return 'tag-error';
        default:
            return '';
    }
}
function getStatusText(status) {
    switch (status) {
        case 'running':
            return '运行中';
        case 'starting':
            return '启动中';
        case 'error':
            return '错误';
        default:
            return '已停止';
    }
}
function toggleTools(serverId) {
    if (expandedServers.value.has(serverId)) {
        expandedServers.value.delete(serverId);
    }
    else {
        expandedServers.value.add(serverId);
    }
}
function addEnvVar() {
    form.envVars.push({ key: '', value: '' });
}
function removeEnvVar(index) {
    form.envVars.splice(index, 1);
}
function envVarsToRecord(envVars) {
    const result = {};
    for (const { key, value } of envVars) {
        if (key.trim()) {
            result[key.trim()] = value;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function recordToEnvVars(env) {
    if (!env)
        return [];
    return Object.entries(env).map(([key, value]) => ({ key, value }));
}
// 切换到 JSON 模式时，生成当前配置的 JSON
function switchToJsonMode() {
    const config = {
        mcpServers: {},
    };
    for (const server of store.mcpServers) {
        const serverConfig = {};
        if (server.type === 'stdio') {
            serverConfig.command = server.command;
            if (server.args && server.args.length > 0) {
                serverConfig.args = server.args;
            }
            if (server.env && Object.keys(server.env).length > 0) {
                serverConfig.env = server.env;
            }
        }
        else {
            serverConfig.url = server.url;
            if (server.headers && Object.keys(server.headers).length > 0) {
                serverConfig.headers = server.headers;
            }
        }
        config.mcpServers[server.name] = serverConfig;
    }
    jsonConfig.value = JSON.stringify(config, null, 2);
    jsonError.value = '';
    viewMode.value = 'json';
}
function handleEditorMount(editor) {
    monacoEditor = editor;
    // 添加 Ctrl+S 保存快捷键
    editor.addCommand(
    // KeyMod.CtrlCmd | KeyCode.KeyS
    2048 | 49, // Ctrl+S
    () => {
        saveJsonConfig();
    });
}
// 保存 JSON 配置
async function saveJsonConfig() {
    jsonError.value = '';
    try {
        const config = JSON.parse(jsonConfig.value);
        if (!config.mcpServers || typeof config.mcpServers !== 'object') {
            jsonError.value = '配置格式错误：缺少 mcpServers 字段';
            return;
        }
        jsonSaving.value = true;
        // 并行删除所有现有服务（不等待 MCP 重新初始化）
        const deletePromises = store.mcpServers.map((server) => api.deleteMCPServer(server.id).catch(() => { }));
        await Promise.all(deletePromises);
        // 并行创建新服务
        const createPromises = Object.entries(config.mcpServers).map(([name, serverConfig]) => {
            const cfg = serverConfig;
            const isStdio = !!cfg.command;
            return api
                .createMCPServer({
                name,
                type: isStdio ? 'stdio' : 'sse',
                command: cfg.command,
                args: cfg.args,
                env: cfg.env,
                url: cfg.url,
                headers: cfg.headers,
                enabled: true,
                autoStart: false,
            })
                .catch(() => { });
        });
        await Promise.all(createPromises);
        // 配置保存成功，立即返回
        toast.success('配置已保存');
        viewMode.value = 'list';
        jsonSaving.value = false;
        // 后台异步刷新数据，不阻塞 UI
        store.fetchMCPServers();
    }
    catch (e) {
        jsonSaving.value = false;
        if (e instanceof SyntaxError) {
            jsonError.value = `JSON 语法错误：${e.message}`;
        }
        else {
            jsonError.value = `保存失败：${e.message || '未知错误'}`;
        }
    }
}
function showAddModal() {
    editingServer.value = null;
    form.name = '';
    form.type = 'stdio';
    form.command = '';
    form.argsStr = '';
    form.url = '';
    form.enabled = true;
    form.envVars = [];
    modalVisible.value = true;
}
function editServer(server) {
    editingServer.value = server;
    form.name = server.name;
    form.type = server.type;
    form.command = server.command || '';
    form.argsStr = server.args?.join(' ') || '';
    form.url = server.url || '';
    form.enabled = server.enabled;
    form.envVars = recordToEnvVars(server.env);
    modalVisible.value = true;
}
function closeModal() {
    modalVisible.value = false;
}
async function saveServer() {
    if (!form.name) {
        toast.warning('请填写名称');
        return;
    }
    if (form.type === 'stdio' && !form.command) {
        toast.warning('请填写命令');
        return;
    }
    if (form.type === 'sse' && !form.url) {
        toast.warning('请填写服务地址');
        return;
    }
    saving.value = true;
    const data = {
        name: form.name,
        type: form.type,
        command: form.type === 'stdio' ? form.command : undefined,
        args: form.type === 'stdio' && form.argsStr ? form.argsStr.split(/\s+/) : undefined,
        env: form.type === 'stdio' ? envVarsToRecord(form.envVars) : undefined,
        url: form.type === 'sse' ? form.url : undefined,
        enabled: form.enabled,
        autoStart: false,
    };
    try {
        if (editingServer.value) {
            await api.updateMCPServer(editingServer.value.id, data);
            toast.success('保存成功');
        }
        else {
            await api.createMCPServer(data);
            toast.success('添加成功');
        }
        closeModal();
        store.fetchMCPServers();
    }
    catch (error) {
        toast.error('操作失败');
    }
    finally {
        saving.value = false;
    }
}
async function startServer(id) {
    serverLoading.value[id] = true;
    try {
        await api.startMCPServer(id);
        toast.success('服务已启动');
        store.fetchMCPServers();
    }
    catch (error) {
        toast.error('启动失败');
    }
    finally {
        serverLoading.value[id] = false;
    }
}
async function stopServer(id) {
    serverLoading.value[id] = true;
    try {
        await api.stopMCPServer(id);
        toast.success('服务已停止');
        store.fetchMCPServers();
    }
    catch (error) {
        toast.error('停止失败');
    }
    finally {
        serverLoading.value[id] = false;
    }
}
async function deleteServer(id) {
    if (!confirm('确定要删除这个 MCP 服务吗？'))
        return;
    try {
        await api.deleteMCPServer(id);
        toast.success('删除成功');
        store.fetchMCPServers();
    }
    catch (error) {
        toast.error('删除失败');
    }
}
// 轮询刷新 MCP 状态
let pollInterval = null;
const POLL_INTERVAL = 2000; // 2秒刷新一次
function startPolling() {
    // 立即获取一次
    store.fetchMCPServers();
    // 定时轮询
    pollInterval = setInterval(() => {
        // 只在列表模式下轮询
        if (viewMode.value === 'list') {
            store.fetchMCPServers();
        }
    }, POLL_INTERVAL);
}
function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}
onMounted(() => {
    startPolling();
});
onUnmounted(() => {
    stopPolling();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-item']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label-row']} */ ;
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
    ...{ class: "header-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mode-tabs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.viewMode = 'list';
        } },
    ...{ class: "mode-tab" },
    ...{ class: ({ active: __VLS_ctx.viewMode === 'list' }) },
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "8",
    y1: "6",
    x2: "21",
    y2: "6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "8",
    y1: "12",
    x2: "21",
    y2: "12",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "8",
    y1: "18",
    x2: "21",
    y2: "18",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "3",
    y1: "6",
    x2: "3.01",
    y2: "6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "3",
    y1: "12",
    x2: "3.01",
    y2: "12",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
    x1: "3",
    y1: "18",
    x2: "3.01",
    y2: "18",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.switchToJsonMode) },
    ...{ class: "mode-tab" },
    ...{ class: ({ active: __VLS_ctx.viewMode === 'json' }) },
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
    points: "16 18 22 12 16 6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
    points: "8 6 2 12 8 18",
});
if (__VLS_ctx.viewMode === 'list') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.showAddModal) },
        ...{ class: "btn btn-primary" },
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
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveJsonConfig) },
        ...{ class: "btn btn-primary" },
        disabled: (__VLS_ctx.jsonSaving),
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
        d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
        points: "17 21 17 13 7 13 7 21",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
        points: "7 3 7 8 15 8",
    });
    (__VLS_ctx.jsonSaving ? '保存中...' : '保存配置');
}
if (__VLS_ctx.viewMode === 'list') {
    if (__VLS_ctx.store.mcpServers.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "server-list" },
        });
        for (const [server] of __VLS_getVForSourceType((__VLS_ctx.store.mcpServers))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (server.id),
                ...{ class: "server-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "server-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "server-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "server-name" },
            });
            (server.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "tag" },
                ...{ class: (__VLS_ctx.getStatusClass(server.status)) },
            });
            (__VLS_ctx.getStatusText(server.status));
            if (server.error) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "error-hint" },
                    title: (server.error),
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "server-actions" },
            });
            if (server.status !== 'running') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.viewMode === 'list'))
                                return;
                            if (!(__VLS_ctx.store.mcpServers.length > 0))
                                return;
                            if (!(server.status !== 'running'))
                                return;
                            __VLS_ctx.startServer(server.id);
                        } },
                    ...{ class: "btn btn-sm btn-secondary" },
                    disabled: (__VLS_ctx.serverLoading[server.id]),
                });
                (__VLS_ctx.serverLoading[server.id] ? '启动中...' : '启动');
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.viewMode === 'list'))
                                return;
                            if (!(__VLS_ctx.store.mcpServers.length > 0))
                                return;
                            if (!!(server.status !== 'running'))
                                return;
                            __VLS_ctx.stopServer(server.id);
                        } },
                    ...{ class: "btn btn-sm btn-secondary" },
                    disabled: (__VLS_ctx.serverLoading[server.id]),
                });
                (__VLS_ctx.serverLoading[server.id] ? '停止中...' : '停止');
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.viewMode === 'list'))
                            return;
                        if (!(__VLS_ctx.store.mcpServers.length > 0))
                            return;
                        __VLS_ctx.editServer(server);
                    } },
                ...{ class: "btn btn-ghost btn-icon" },
                title: "编辑",
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
                d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.viewMode === 'list'))
                            return;
                        if (!(__VLS_ctx.store.mcpServers.length > 0))
                            return;
                        __VLS_ctx.deleteServer(server.id);
                    } },
                ...{ class: "btn btn-ghost btn-icon" },
                title: "删除",
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
            __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                points: "3 6 5 6 21 6",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
                d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "server-details" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "detail-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "detail-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (server.type === 'stdio' ? '本地命令' : 'SSE 远程');
            if (server.type === 'stdio') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "detail-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "detail-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
                (server.command);
                (server.args?.join(' '));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "detail-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "detail-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (server.url);
            }
            if (server.env && Object.keys(server.env).length > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "detail-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "detail-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "env-count" },
                });
                (Object.keys(server.env).length);
            }
            if (server.error) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "error-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "error-header" },
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
                __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
                    cx: "12",
                    cy: "12",
                    r: "10",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                    x1: "12",
                    y1: "8",
                    x2: "12",
                    y2: "12",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
                    x1: "12",
                    y1: "16",
                    x2: "12.01",
                    y2: "16",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                    ...{ class: "error-message" },
                });
                (server.error);
            }
            if (server.tools && server.tools.length > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tools-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.viewMode === 'list'))
                                return;
                            if (!(__VLS_ctx.store.mcpServers.length > 0))
                                return;
                            if (!(server.tools && server.tools.length > 0))
                                return;
                            __VLS_ctx.toggleTools(server.id);
                        } },
                    ...{ class: "tools-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (server.tools.length);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    xmlns: "http://www.w3.org/2000/svg",
                    width: "14",
                    height: "14",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    'stroke-width': "2",
                    ...{ style: ({ transform: __VLS_ctx.expandedServers.has(server.id) ? 'rotate(180deg)' : '' }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline, __VLS_intrinsicElements.polyline)({
                    points: "6 9 12 15 18 9",
                });
                if (__VLS_ctx.expandedServers.has(server.id)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "tools-list" },
                    });
                    for (const [tool] of __VLS_getVForSourceType((server.tools))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (tool.name),
                            ...{ class: "tool-item" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "tool-name" },
                        });
                        (tool.name);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "tool-desc" },
                        });
                        (tool.description);
                    }
                }
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty-hint" },
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "json-editor-wrapper" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "json-tips" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tip-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tip-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        href: "https://modelcontextprotocol.io/docs",
        target: "_blank",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-container" },
    });
    const __VLS_0 = {}.VueMonacoEditor;
    /** @type {[typeof __VLS_components.VueMonacoEditor, typeof __VLS_components.vueMonacoEditor, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onMount': {} },
        value: (__VLS_ctx.jsonConfig),
        language: "json",
        theme: (__VLS_ctx.store.theme === 'dark' ? 'vs-dark' : 'vs'),
        options: (__VLS_ctx.editorOptions),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onMount': {} },
        value: (__VLS_ctx.jsonConfig),
        language: "json",
        theme: (__VLS_ctx.store.theme === 'dark' ? 'vs-dark' : 'vs'),
        options: (__VLS_ctx.editorOptions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onMount: (__VLS_ctx.handleEditorMount)
    };
    var __VLS_3;
    if (__VLS_ctx.jsonError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "json-error" },
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "10",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "8",
            x2: "12",
            y2: "12",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line, __VLS_intrinsicElements.line)({
            x1: "12",
            y1: "16",
            x2: "12.01",
            y2: "16",
        });
        (__VLS_ctx.jsonError);
    }
}
if (__VLS_ctx.modalVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "modal-overlay" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal modal-lg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "modal-title" },
    });
    (__VLS_ctx.editingServer ? '编辑 MCP 服务' : '添加 MCP 服务');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "btn btn-ghost btn-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "18",
        height: "18",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "text",
        ...{ class: "input" },
        value: (__VLS_ctx.form.name),
        placeholder: "如: github",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "radio-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "radio-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "stdio",
    });
    (__VLS_ctx.form.type);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "radio-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "sse",
    });
    (__VLS_ctx.form.type);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.form.type === 'stdio') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "text",
            ...{ class: "input" },
            value: (__VLS_ctx.form.command),
            placeholder: "如: docker, node, npx",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "text",
            ...{ class: "input" },
            value: (__VLS_ctx.form.argsStr),
            placeholder: "如: run -i --rm mcp/github",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "form-hint" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-label-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.addEnvVar) },
            type: "button",
            ...{ class: "btn btn-sm btn-ghost" },
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
        if (__VLS_ctx.form.envVars.length > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "env-list" },
            });
            for (const [env, index] of __VLS_getVForSourceType((__VLS_ctx.form.envVars))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (index),
                    ...{ class: "env-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    type: "text",
                    ...{ class: "input env-key" },
                    value: (env.key),
                    placeholder: "变量名",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "env-eq" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    type: "text",
                    ...{ class: "input env-value" },
                    value: (env.value),
                    placeholder: "值",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.modalVisible))
                                return;
                            if (!(__VLS_ctx.form.type === 'stdio'))
                                return;
                            if (!(__VLS_ctx.form.envVars.length > 0))
                                return;
                            __VLS_ctx.removeEnvVar(index);
                        } },
                    type: "button",
                    ...{ class: "btn btn-ghost btn-icon" },
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
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "form-hint" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "text",
            ...{ class: "input" },
            value: (__VLS_ctx.form.url),
            placeholder: "http://localhost:3001/mcp",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.modalVisible))
                    return;
                __VLS_ctx.form.enabled = !__VLS_ctx.form.enabled;
            } },
        ...{ class: "switch" },
        ...{ class: ({ active: __VLS_ctx.form.enabled }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeModal) },
        ...{ class: "btn btn-secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveServer) },
        ...{ class: "btn btn-primary" },
        disabled: (__VLS_ctx.saving),
    });
    (__VLS_ctx.saving ? '保存中...' : '保存');
}
/** @type {__VLS_StyleScopedClasses['setting-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['description']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['server-list']} */ ;
/** @type {__VLS_StyleScopedClasses['server-card']} */ ;
/** @type {__VLS_StyleScopedClasses['server-header']} */ ;
/** @type {__VLS_StyleScopedClasses['server-info']} */ ;
/** @type {__VLS_StyleScopedClasses['server-name']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['error-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['server-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['server-details']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
/** @type {__VLS_StyleScopedClasses['env-count']} */ ;
/** @type {__VLS_StyleScopedClasses['error-section']} */ ;
/** @type {__VLS_StyleScopedClasses['error-header']} */ ;
/** @type {__VLS_StyleScopedClasses['error-message']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-section']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tools-list']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-name']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['json-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['json-tips']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-container']} */ ;
/** @type {__VLS_StyleScopedClasses['json-error']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-title']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-item']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-item']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['env-list']} */ ;
/** @type {__VLS_StyleScopedClasses['env-row']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['env-key']} */ ;
/** @type {__VLS_StyleScopedClasses['env-eq']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['env-value']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['form-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            store: store,
            viewMode: viewMode,
            modalVisible: modalVisible,
            editingServer: editingServer,
            saving: saving,
            jsonSaving: jsonSaving,
            serverLoading: serverLoading,
            expandedServers: expandedServers,
            jsonConfig: jsonConfig,
            jsonError: jsonError,
            editorOptions: editorOptions,
            form: form,
            getStatusClass: getStatusClass,
            getStatusText: getStatusText,
            toggleTools: toggleTools,
            addEnvVar: addEnvVar,
            removeEnvVar: removeEnvVar,
            switchToJsonMode: switchToJsonMode,
            handleEditorMount: handleEditorMount,
            saveJsonConfig: saveJsonConfig,
            showAddModal: showAddModal,
            editServer: editServer,
            closeModal: closeModal,
            saveServer: saveServer,
            startServer: startServer,
            stopServer: stopServer,
            deleteServer: deleteServer,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

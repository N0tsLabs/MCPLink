import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
// @ts-ignore
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
const props = defineProps();
const previewImage = ref(null);
// 处理点击事件
function handleClick(e) {
    const target = e.target;
    if (target.tagName === 'IMG' && target.classList.contains('markdown-image')) {
        previewImage.value = target.src;
    }
}
// 初始化 markdown-it
const md = new MarkdownIt({
    html: true,
    breaks: true, // 软换行转硬换行
    linkify: true, // 自动链接
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            }
            catch (__) { }
        }
        return ''; // 使用默认转义
    }
});
// 使用任务列表插件
md.use(taskLists);
// 自定义 fence (代码块) 渲染
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    let langName = '';
    let highlighted;
    if (info) {
        langName = info.split(/\s+/g)[0];
    }
    if (options.highlight) {
        highlighted = options.highlight(token.content, langName, '') || md.utils.escapeHtml(token.content);
    }
    else {
        highlighted = md.utils.escapeHtml(token.content);
    }
    const langLabel = langName || 'text';
    // 注入 onclick 脚本以实现复制功能
    // 注意：这里的 encodeURIComponent 用于防止 XSS 和破坏 HTML 结构
    return `<div class="code-block-wrapper">
    <div class="code-block-header">
      <span class="code-lang">${langLabel}</span>
      <button class="copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(token.content)}')).then(() => { this.textContent = '已复制!'; setTimeout(() => this.textContent = '复制', 2000); })">复制</button>
    </div>
    <pre class="code-block"><code class="hljs language-${langName}">${highlighted}</code></pre>
  </div>`;
};
// 链接 - 新窗口打开
// 保存默认规则引用
const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    // 确保有 attrs 数组
    if (!tokens[idx].attrs) {
        tokens[idx].attrs = [];
    }
    const aIndex = tokens[idx].attrIndex('target');
    if (aIndex < 0) {
        tokens[idx].attrPush(['target', '_blank']);
    }
    else {
        // @ts-ignore
        tokens[idx].attrs[aIndex][1] = '_blank';
    }
    // 添加 noopener noreferrer
    tokens[idx].attrPush(['rel', 'noopener noreferrer']);
    return defaultLinkOpen(tokens, idx, options, env, self);
};
// 图片 - 限制大小并添加点击预览
md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const src = token.attrGet('src') || '';
    const alt = token.content;
    const title = token.attrGet('title') || '';
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = alt ? ` alt="${alt}"` : '';
    return `<div class="markdown-image-wrapper">
        <img src="${src}"${altAttr}${titleAttr} class="markdown-image" loading="lazy" />
    </div>`;
};
// 行内代码
md.renderer.rules.code_inline = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    return `<code class="inline-code">${md.utils.escapeHtml(token.content)}</code>`;
};
// 渲染 markdown
const renderedContent = computed(() => {
    if (!props.content)
        return '';
    try {
        return md.render(props.content);
    }
    catch (e) {
        console.error('Markdown parse error:', e);
        return props.content;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onClick: (__VLS_ctx.handleClick) },
    ...{ class: "markdown-body" },
});
__VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderedContent) }, null, null);
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
if (__VLS_ctx.previewImage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.previewImage))
                    return;
                __VLS_ctx.previewImage = null;
            } },
        ...{ class: "image-preview-overlay" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "image-preview-container" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        ...{ onClick: () => { } },
        src: (__VLS_ctx.previewImage),
        ...{ class: "image-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.previewImage))
                    return;
                __VLS_ctx.previewImage = null;
            } },
        ...{ class: "image-preview-close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "24",
        height: "24",
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
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['markdown-body']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview-container']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview-close']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            previewImage: previewImage,
            handleClick: handleClick,
            renderedContent: renderedContent,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */

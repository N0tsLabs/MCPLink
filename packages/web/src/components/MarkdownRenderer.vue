<template>
    <div class="markdown-body" v-html="renderedContent"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const props = defineProps<{
    content: string
}>()

// 配置 marked
marked.setOptions({
    breaks: true,
    gfm: true,
})

// 自定义渲染器
const renderer = new marked.Renderer()

// 代码块渲染 - 添加语言标签和复制按钮
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    const highlighted = hljs.highlight(text, { language }).value
    const langLabel = lang || 'code'

    return `<div class="code-block-wrapper">
    <div class="code-block-header">
      <span class="code-lang">${langLabel}</span>
      <button class="copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(text)}')).then(() => { this.textContent = '已复制!'; setTimeout(() => this.textContent = '复制', 2000); })">复制</button>
    </div>
    <pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`
}

// 行内代码
renderer.codespan = ({ text }: { text: string }) => {
    return `<code class="inline-code">${text}</code>`
}

// 链接 - 新窗口打开
// @ts-ignore - marked v17 类型定义问题
renderer.link = ({ href, title, text }: any) => {
    const titleAttr = title ? ` title="${title}"` : ''
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
}

// 设置渲染器
marked.use({ renderer })

// 渲染 markdown
const renderedContent = computed(() => {
    if (!props.content) return ''

    try {
        return marked.parse(props.content) as string
    } catch (e) {
        console.error('Markdown parse error:', e)
        return props.content
    }
})
</script>

<style>
/* Markdown 基础样式 */
.markdown-body {
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-primary);
    word-break: break-word;
}

/* 段落 */
.markdown-body p {
    margin: 0 0 1em 0;
}

.markdown-body p:last-child {
    margin-bottom: 0;
}

/* 标题 */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
    margin: 1.5em 0 0.75em 0;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
}

.markdown-body h1:first-child,
.markdown-body h2:first-child,
.markdown-body h3:first-child {
    margin-top: 0;
}

.markdown-body h1 {
    font-size: 1.5em;
}
.markdown-body h2 {
    font-size: 1.35em;
}
.markdown-body h3 {
    font-size: 1.2em;
}
.markdown-body h4 {
    font-size: 1.1em;
}
.markdown-body h5 {
    font-size: 1em;
}
.markdown-body h6 {
    font-size: 0.9em;
}

/* 列表 */
.markdown-body ul,
.markdown-body ol {
    margin: 0.5em 0 1em 0;
    padding-left: 1.5em;
}

.markdown-body li {
    margin: 0.25em 0;
}

.markdown-body li > ul,
.markdown-body li > ol {
    margin: 0.25em 0;
}

/* 行内代码 */
.markdown-body .inline-code {
    background: var(--bg-tertiary);
    color: var(--accent-color);
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
    font-size: 0.9em;
    word-break: break-word;
}

/* 代码块容器 */
.markdown-body .code-block-wrapper {
    margin: 1em 0;
    border-radius: 8px;
    overflow: hidden;
    background: #1e1e1e;
    border: 1px solid var(--border-color);
}

/* 代码块头部 */
.markdown-body .code-block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #3d3d3d;
}

.markdown-body .code-lang {
    font-size: 12px;
    color: #888;
    font-family: inherit;
    text-transform: lowercase;
}

.markdown-body .copy-btn {
    background: transparent;
    border: 1px solid #555;
    color: #aaa;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.markdown-body .copy-btn:hover {
    background: #3d3d3d;
    color: #fff;
    border-color: #666;
}

/* 代码块 */
.markdown-body .code-block {
    margin: 0;
    padding: 16px;
    overflow-x: auto;
    background: #1e1e1e;
}

.markdown-body .code-block code {
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    color: #d4d4d4;
}

/* 引用 */
.markdown-body blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid var(--accent-color);
    background: var(--bg-tertiary);
    border-radius: 0 8px 8px 0;
    color: var(--text-secondary);
}

.markdown-body blockquote p {
    margin: 0;
}

/* 链接 */
.markdown-body a {
    color: var(--accent-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
}

.markdown-body a:hover {
    border-bottom-color: var(--accent-color);
}

/* 粗体和斜体 */
.markdown-body strong {
    font-weight: 600;
    color: var(--text-primary);
}

.markdown-body em {
    font-style: italic;
}

/* 分割线 */
.markdown-body hr {
    margin: 1.5em 0;
    border: none;
    border-top: 1px solid var(--border-color);
}

/* 表格 */
.markdown-body .table-wrapper {
    margin: 1em 0;
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.markdown-body table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.markdown-body th,
.markdown-body td {
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
}

.markdown-body th {
    background: var(--bg-tertiary);
    font-weight: 600;
}

.markdown-body tr:last-child td {
    border-bottom: none;
}

.markdown-body tr:hover td {
    background: var(--bg-hover);
}

/* 图片 */
.markdown-body img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5em 0;
}

/* 任务列表 */
.markdown-body input[type='checkbox'] {
    margin-right: 0.5em;
    transform: scale(1.1);
}

/* highlight.js 主题覆盖 - VS Code Dark+ 风格 */
.hljs {
    background: transparent !important;
}

.hljs-keyword {
    color: #569cd6;
}
.hljs-built_in {
    color: #4ec9b0;
}
.hljs-type {
    color: #4ec9b0;
}
.hljs-literal {
    color: #569cd6;
}
.hljs-number {
    color: #b5cea8;
}
.hljs-string {
    color: #ce9178;
}
.hljs-regexp {
    color: #d16969;
}
.hljs-symbol {
    color: #569cd6;
}
.hljs-variable {
    color: #9cdcfe;
}
.hljs-template-variable {
    color: #9cdcfe;
}
.hljs-link {
    color: #ce9178;
}
.hljs-selector-attr {
    color: #d7ba7d;
}
.hljs-selector-pseudo {
    color: #d7ba7d;
}
.hljs-selector-id {
    color: #d7ba7d;
}
.hljs-selector-class {
    color: #d7ba7d;
}
.hljs-selector-tag {
    color: #569cd6;
}
.hljs-doctag {
    color: #608b4e;
}
.hljs-comment {
    color: #6a9955;
    font-style: italic;
}
.hljs-attr {
    color: #9cdcfe;
}
.hljs-attribute {
    color: #9cdcfe;
}
.hljs-name {
    color: #569cd6;
}
.hljs-function {
    color: #dcdcaa;
}
.hljs-title {
    color: #dcdcaa;
}
.hljs-title.function_ {
    color: #dcdcaa;
}
.hljs-title.class_ {
    color: #4ec9b0;
}
.hljs-params {
    color: #9cdcfe;
}
.hljs-property {
    color: #9cdcfe;
}
.hljs-punctuation {
    color: #d4d4d4;
}
.hljs-operator {
    color: #d4d4d4;
}
.hljs-meta {
    color: #569cd6;
}
.hljs-tag {
    color: #808080;
}
.hljs-deletion {
    background: #72271c;
}
.hljs-addition {
    background: #1e4620;
}
</style>

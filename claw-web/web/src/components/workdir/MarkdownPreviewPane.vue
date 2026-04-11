<script setup lang="ts">
/**
 * 工作区 Markdown 预览（与 Monaco 编辑同源，实时刷新）
 */
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import 'highlight.js/styles/github-dark.css'

const props = defineProps<{
  source: string
}>()

const html = computed(() => renderMarkdown(props.source || '', { sanitize: true }))
</script>

<template>
  <div class="md-preview-root">
    <div class="md-preview-scroll">
      <article class="md-preview-body" v-html="html" />
    </div>
  </div>
</template>

<style scoped>
.md-preview-root {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
}

.md-preview-scroll {
  flex: 1;
  overflow: auto;
  padding: 20px 28px 32px;
}

.md-preview-body {
  max-width: 860px;
  margin: 0 auto;
  font-size: 14px;
  line-height: 1.65;
  word-wrap: break-word;
}

.md-preview-body :deep(h1) {
  font-size: 1.75em;
  font-weight: 600;
  margin: 0.6em 0 0.4em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid #333;
  color: #e8e8e8;
}

.md-preview-body :deep(h2) {
  font-size: 1.35em;
  font-weight: 600;
  margin: 1.1em 0 0.45em;
  color: #e0e0e0;
}

.md-preview-body :deep(h3) {
  font-size: 1.12em;
  font-weight: 600;
  margin: 1em 0 0.35em;
  color: #d8d8d8;
}

.md-preview-body :deep(p) {
  margin: 0.65em 0;
}

.md-preview-body :deep(a) {
  color: #4fc3f7;
  text-decoration: none;
}

.md-preview-body :deep(a:hover) {
  text-decoration: underline;
}

.md-preview-body :deep(ul),
.md-preview-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.6em;
}

.md-preview-body :deep(li) {
  margin: 0.25em 0;
}

.md-preview-body :deep(blockquote) {
  margin: 0.8em 0;
  padding: 0.35em 0 0.35em 1em;
  border-left: 4px solid #3d5a80;
  color: #b0b0b0;
  background: rgba(255, 255, 255, 0.03);
}

.md-preview-body :deep(code) {
  font-family: var(--font-family-mono, Consolas, 'Courier New', monospace);
  font-size: 0.9em;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #ce9178;
}

.md-preview-body :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  overflow-x: auto;
  border-radius: 8px;
  background: #0d1117;
  border: 1px solid #30363d;
}

.md-preview-body :deep(pre code) {
  padding: 0;
  background: transparent;
  color: #d4d4d4;
  font-size: 13px;
  line-height: 1.5;
}

.md-preview-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 13px;
}

.md-preview-body :deep(th),
.md-preview-body :deep(td) {
  border: 1px solid #3c3c3c;
  padding: 8px 12px;
  text-align: left;
}

.md-preview-body :deep(th) {
  background: #2a2a2a;
  font-weight: 600;
}

.md-preview-body :deep(tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.02);
}

.md-preview-body :deep(hr) {
  border: none;
  border-top: 1px solid #333;
  margin: 1.5em 0;
}

.md-preview-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>

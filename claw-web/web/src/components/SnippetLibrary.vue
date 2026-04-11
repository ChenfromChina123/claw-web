<script setup lang="ts">
/**
 * 代码片段库组件
 * 提供代码片段的浏览、搜索、复制和管理功能
 */
import { ref, computed } from 'vue'
import {
  NModal,
  NCard,
  NInput,
  NButton,
  NEmpty,
  NTag,
  NPopconfirm,
  NTooltip,
  useMessage,
} from 'naive-ui'
import { useSnippetStore, type CodeSnippet } from '@/stores/snippet'
import { copyToClipboard } from '@/utils/markdown'
import hljs from 'highlight.js'

interface Props {
  show: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const snippetStore = useSnippetStore()
const message = useMessage()

const searchKeyword = ref('')
const editingSnippet = ref<CodeSnippet | null>(null)
const editDescription = ref('')
const editTags = ref('')

const filteredSnippets = computed(() => {
  if (!searchKeyword.value.trim()) {
    return snippetStore.sortedSnippets
  }
  return snippetStore.searchSnippets(searchKeyword.value)
})

const languageOptions = computed(() => {
  const languages = new Set(snippetStore.snippets.map(s => s.language))
  return Array.from(languages).sort()
})

function close() {
  emit('update:show', false)
}

async function handleCopy(snippet: CodeSnippet) {
  try {
    await copyToClipboard(snippet.code)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function startEdit(snippet: CodeSnippet) {
  editingSnippet.value = snippet
  editDescription.value = snippet.description || ''
  editTags.value = snippet.tags.join(', ')
}

function saveEdit() {
  if (!editingSnippet.value) return

  const tags = editTags.value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)

  snippetStore.updateSnippet(editingSnippet.value.id, {
    description: editDescription.value.trim() || undefined,
    tags,
  })

  editingSnippet.value = null
  message.success('修改已保存')
}

function cancelEdit() {
  editingSnippet.value = null
}

function handleDelete(id: string) {
  snippetStore.removeSnippet(id)
  message.success('已删除')
}

function getHighlightedCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value
    } catch {
      // fallthrough
    }
  }
  return hljs.highlightAuto(code).value
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="代码片段库"
    style="max-width: 900px; max-height: 80vh;"
    :mask-closable="true"
    @update:show="(val: boolean) => emit('update:show', val)"
  >
    <div class="snippet-library">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <NInput
          v-model:value="searchKeyword"
          placeholder="搜索代码片段..."
          clearable
        >
          <template #prefix>
            <span>🔍</span>
          </template>
        </NInput>
      </div>

      <!-- 片段列表 -->
      <div v-if="filteredSnippets.length === 0" class="empty-state">
        <NEmpty :description="searchKeyword ? '未找到匹配的代码片段' : '暂无收藏的代码片段'">
          <template #extra>
            <span style="color: #666; font-size: 12px;">
              {{ searchKeyword ? '尝试其他关键词' : '在聊天中点击代码块的收藏按钮来添加' }}
            </span>
          </template>
        </NEmpty>
      </div>

      <div v-else class="snippet-list">
        <div
          v-for="snippet in filteredSnippets"
          :key="snippet.id"
          class="snippet-item"
        >
          <div class="snippet-header">
            <div class="snippet-info">
              <NTag :type="snippet.language === 'typescript' ? 'success' : 'info'" size="small">
                {{ snippet.language || 'plaintext' }}
              </NTag>
              <span v-if="snippet.description" class="snippet-desc">{{ snippet.description }}</span>
            </div>
            <div class="snippet-actions">
              <NTooltip trigger="hover">
                <template #trigger>
                  <NButton size="tiny" @click="handleCopy(snippet)">
                    📋 复制
                  </NButton>
                </template>
                点击复制代码
              </NTooltip>

              <NTooltip trigger="hover">
                <template #trigger>
                  <NButton size="tiny" @click="startEdit(snippet)">
                    ✏️ 编辑
                  </NButton>
                </template>
                修改描述和标签
              </NTooltip>

              <NPopconfirm
                @positive-click="handleDelete(snippet.id)"
              >
                <template #trigger>
                  <NButton size="tiny" type="error">
                    🗑️ 删除
                  </NButton>
                </template>
                确定要删除这个代码片段吗？
              </NPopconfirm>
            </div>
          </div>

          <!-- 编辑模式 -->
          <div v-if="editingSnippet?.id === snippet.id" class="snippet-edit">
            <NInput
              v-model:value="editDescription"
              type="text"
              placeholder="添加描述（可选）"
            />
            <NInput
              v-model:value="editTags"
              type="text"
              placeholder="标签，用逗号分隔（可选）"
              style="margin-top: 8px;"
            />
            <div class="edit-actions">
              <NButton size="small" type="primary" @click="saveEdit">
                保存
              </NButton>
              <NButton size="small" @click="cancelEdit">
                取消
              </NButton>
            </div>
          </div>

          <!-- 代码预览 -->
          <div class="snippet-code">
            <pre><code v-html="getHighlightedCode(snippet.code, snippet.language)"></code></pre>
          </div>

          <!-- 标签和时间 -->
          <div class="snippet-footer">
            <div class="snippet-tags">
              <NTag
                v-for="tag in snippet.tags"
                :key="tag"
                size="tiny"
                :bordered="false"
              >
                {{ tag }}
              </NTag>
            </div>
            <span class="snippet-time">{{ formatDate(snippet.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.snippet-library {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.search-bar {
  position: sticky;
  top: 0;
  background: #1e1e2e;
  padding: 8px 0;
  z-index: 10;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}

.snippet-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.snippet-item {
  background: #252536;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #333;
}

.snippet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.snippet-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snippet-desc {
  color: #a0a0a0;
  font-size: 13px;
}

.snippet-actions {
  display: flex;
  gap: 8px;
}

.snippet-edit {
  margin-bottom: 12px;
  padding: 12px;
  background: #1e1e2e;
  border-radius: 6px;
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.snippet-code {
  background: #0d1117;
  border-radius: 6px;
  overflow-x: auto;
}

.snippet-code pre {
  margin: 0;
  padding: 12px;
}

.snippet-code code {
  font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.snippet-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.snippet-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.snippet-time {
  color: #666;
  font-size: 11px;
}
</style>

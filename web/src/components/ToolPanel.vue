<script setup lang="ts">
/**
 * 工具面板组件
 * 显示所有可用的工具，按类别分组
 */

import { ref, computed, onMounted } from 'vue'
import { 
  NCard, NButton, NSpace, NTag,
  NEmpty, NCode, useMessage, NSpin
} from 'naive-ui'
import toolApi from '@/api/toolApi'
import type { ToolDefinition } from '@/types'

const message = useMessage()

const tools = ref<ToolDefinition[]>([])
const categories = ref<string[]>([])
const loading = ref(false)
const selectedCategory = ref<string | null>(null)
const selectedTool = ref<ToolDefinition | null>(null)

const filteredTools = computed(() => {
  if (!selectedCategory.value) return tools.value
  return tools.value.filter(t => t.category === selectedCategory.value)
})

const loadTools = async () => {
  loading.value = true
  try {
    const response = await toolApi.listTools()
    tools.value = response.tools
    categories.value = response.categories
  } catch (error) {
    message.error('加载工具列表失败')
    console.error('Failed to load tools:', error)
  } finally {
    loading.value = false
  }
}

const selectTool = (tool: ToolDefinition) => {
  selectedTool.value = tool
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    file: 'info',
    shell: 'warning',
    web: 'success',
    system: 'error',
    ai: 'primary',
    mcp: 'default',
  }
  return colors[category] || 'default'
}

const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    file: '文件操作',
    shell: 'Shell 命令',
    web: '网络工具',
    system: '系统工具',
    ai: 'AI 工具',
    mcp: 'MCP 工具',
  }
  return labels[category] || category
}

const formatInputSchema = (schema: Record<string, unknown>) => {
  try {
    return JSON.stringify(schema, null, 2)
  } catch {
    return String(schema)
  }
}

onMounted(() => {
  loadTools()
})
</script>

<template>
  <div class="tool-panel">
    <div class="tool-sidebar">
      <div class="sidebar-header">
        <h3>工具</h3>
        <NButton size="tiny" :loading="loading" @click="loadTools">
          刷新
        </NButton>
      </div>

      <div class="category-filter">
        <NTag 
          :type="!selectedCategory ? 'primary' : 'default'"
          class="category-tag"
          checkable
          @click="selectedCategory = null"
        >
          全部 ({{ tools.length }})
        </NTag>
        <NTag 
          v-for="cat in categories" 
          :key="cat"
          :type="selectedCategory === cat ? 'primary' : 'default'"
          class="category-tag"
          checkable
          @click="selectedCategory = cat"
        >
          {{ getCategoryLabel(cat) }} ({{ tools.filter(t => t.category === cat).length }})
        </NTag>
      </div>

      <div v-if="loading" class="loading-container">
        <NSpin size="medium" />
        <span>加载中...</span>
      </div>

      <NEmpty v-else-if="filteredTools.length === 0" description="没有可用的工具" />

      <div v-else class="tool-list">
        <div 
          v-for="tool in filteredTools" 
          :key="tool.name"
          class="tool-item"
          :class="{ selected: selectedTool?.name === tool.name }"
          @click="selectTool(tool)"
        >
          <div class="tool-item-header">
            <NTag size="small" :type="getCategoryColor(tool.category) as any">
              {{ getCategoryLabel(tool.category) }}
            </NTag>
            <span class="tool-name">{{ tool.name }}</span>
          </div>
          <p class="tool-description">{{ tool.description }}</p>
        </div>
      </div>
    </div>

    <div class="tool-detail">
      <NCard v-if="selectedTool" :title="selectedTool.name">
        <div class="detail-content">
          <div class="detail-section">
            <h4>描述</h4>
            <p>{{ selectedTool.description }}</p>
          </div>

          <div class="detail-section">
            <h4>类别</h4>
            <NTag :type="getCategoryColor(selectedTool.category) as any">
              {{ getCategoryLabel(selectedTool.category) }}
            </NTag>
          </div>

          <div class="detail-section">
            <h4>权限</h4>
            <NSpace>
              <NTag v-if="selectedTool.permissions?.dangerous" type="warning">
                危险操作
              </NTag>
              <NTag v-if="selectedTool.permissions?.sandboxed" type="info">
                沙箱模式
              </NTag>
              <NTag v-if="!selectedTool.permissions?.dangerous && !selectedTool.permissions?.sandboxed" type="success">
                安全
              </NTag>
            </NSpace>
          </div>

          <div class="detail-section">
            <h4>输入参数</h4>
            <NCode 
              :code="formatInputSchema(selectedTool.inputSchema)" 
              language="json"
            />
          </div>
        </div>
      </NCard>

      <NEmpty v-else description="选择一个工具查看详情" />
    </div>
  </div>
</template>

<style scoped>
.tool-panel {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  height: 600px;
  gap: 16px;
  box-sizing: border-box;
}

.tool-sidebar {
  flex: 0 0 clamp(220px, 28vw, 300px);
  width: clamp(220px, 28vw, 300px);
  max-width: min(300px, 42vw);
  display: flex;
  flex-direction: column;
  background: var(--n-color);
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--n-border-color);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
}

.category-filter {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid var(--n-border-color);
}

.category-tag {
  cursor: pointer;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
}

.tool-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.tool-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.tool-item:hover {
  background: var(--n-color-hover);
}

.tool-item.selected {
  background: var(--n-color-pressed);
  border: 1px solid var(--n-primary-color);
}

.tool-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tool-name {
  font-weight: 500;
  font-size: 14px;
}

.tool-description {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-detail {
  flex: 1 1 0;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  box-sizing: border-box;
}

.tool-detail > :deep(.n-card) {
  flex: 1;
  min-width: 0;
}

.tool-detail > :deep(.n-empty) {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 16px;
  box-sizing: border-box;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-section h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.detail-section p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 720px) {
  .tool-panel {
    flex-direction: column;
    min-height: auto;
  }

  .tool-sidebar {
    flex: none;
    width: 100%;
    max-width: none;
  }

  .tool-detail {
    min-height: 280px;
  }
}
</style>

<script setup lang="ts">
/**
 * 增强版工具结果展示组件 - 深度解析工具输出
 */
import { computed, ref } from 'vue'
import { NTag, NCollapse, NCollapseItem, NTooltip, NProgress } from 'naive-ui'
import type { ToolCall, ParsedResult, KnowledgeCard } from '@/types/flowKnowledge'
import { TOOL_CATEGORIES, getToolCategory } from '@/types/flowKnowledge'
import { parseToolResult } from '@/utils/toolParser'
import KnowledgeCardComponent from './KnowledgeCard.vue'

const props = defineProps<{
  toolCall: ToolCall
  showKnowledge?: boolean
}>()

const isExpanded = ref(true)

// 解析结果
const parsedResult = computed((): ParsedResult => {
  return parseToolResult(props.toolCall)
})

// 获取类别信息
const categoryInfo = computed(() => {
  const category = getToolCategory(props.toolCall.name)
  return TOOL_CATEGORIES[category] || TOOL_CATEGORIES.other
})

// 获取类型配置
const typeConfig = computed(() => {
  const type = parsedResult.value.type
  const configs: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
    success: { label: '成功', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', icon: '✓' },
    failure: { label: '失败', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)', icon: '✗' },
    partial: { label: '部分成功', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', icon: '⚠' },
    info: { label: '信息', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)', icon: 'ℹ' }
  }
  return configs[type] || configs.info
})

// 格式化输出
function formatOutput(output: unknown): string {
  if (output === null || output === undefined) return '无输出'
  if (typeof output === 'string') return output
  return JSON.stringify(output, null, 2)
}

// 截断输出
function truncateOutput(output: string, maxLines: number = 50): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  return lines.slice(0, maxLines).join('\n') + '\n... (省略 ' + (lines.length - maxLines) + ' 行)'
}

// 获取输出统计
const outputStats = computed(() => {
  const output = props.toolCall.output
  if (!output) return null
  
  const stats: {
    lines: number
    files: string[]
    errors: number
    warnings: number
  } = {
    lines: 0,
    files: [],
    errors: 0,
    warnings: 0
  }
  
  if (typeof output === 'string') {
    stats.lines = output.split('\n').length
    
    // 提取文件
    const fileMatches = output.match(/[\w\-.\\\/]+\.(ts|tsx|js|jsx|json|md|txt|py|html|css|vue)/gi)
    if (fileMatches) {
      stats.files = [...new Set(fileMatches)]
    }
    
    // 统计错误/警告
    stats.errors = (output.match(/error/gi) || []).length
    stats.warnings = (output.match(/warning/gi) || []).length
  }
  
  return stats
})
</script>

<template>
  <div 
    class="tool-result-enhanced"
    :class="[`type-${parsedResult.type}`]"
    :style="{ '--result-color': typeConfig.color, '--result-bg': typeConfig.bgColor }"
  >
    <!-- 结果头部 -->
    <div class="result-header">
      <div class="result-main">
        <div class="result-icon" :style="{ color: typeConfig.color }">
          {{ typeConfig.icon }}
        </div>
        <div class="result-info">
          <div class="result-title">
            <span class="result-type">{{ typeConfig.label }}</span>
            <NTag size="tiny" :bordered="false">
              {{ toolCall.name }}
            </NTag>
          </div>
          <div class="result-summary">{{ parsedResult.summary }}</div>
        </div>
      </div>
      
      <div class="result-actions">
        <NTag :type="parsedResult.type === 'success' ? 'success' : parsedResult.type === 'failure' ? 'error' : 'warning'" size="small">
          {{ toolCall.status }}
        </NTag>
      </div>
    </div>
    
    <!-- 输出统计 -->
    <div v-if="outputStats" class="output-stats">
      <div v-if="outputStats.lines > 0" class="stat-item">
        <span class="stat-icon">📄</span>
        <span class="stat-value">{{ outputStats.lines }}</span>
        <span class="stat-label">行</span>
      </div>
      <div v-if="outputStats.files.length > 0" class="stat-item">
        <span class="stat-icon">📁</span>
        <span class="stat-value">{{ outputStats.files.length }}</span>
        <span class="stat-label">文件</span>
      </div>
      <div v-if="outputStats.errors > 0" class="stat-item error">
        <span class="stat-icon">❌</span>
        <span class="stat-value">{{ outputStats.errors }}</span>
        <span class="stat-label">错误</span>
      </div>
      <div v-if="outputStats.warnings > 0" class="stat-item warning">
        <span class="stat-icon">⚠️</span>
        <span class="stat-value">{{ outputStats.warnings }}</span>
        <span class="stat-label">警告</span>
      </div>
    </div>
    
    <!-- 详情列表 -->
    <div v-if="parsedResult.details && parsedResult.details.length > 0" class="result-details">
      <div v-for="(detail, index) in parsedResult.details" :key="index" class="detail-item">
        <span class="detail-icon">•</span>
        <span class="detail-text">{{ detail }}</span>
      </div>
    </div>
    
    <!-- 输出内容 -->
    <div v-if="toolCall.output" class="output-section">
      <div class="output-header" @click="isExpanded = !isExpanded">
        <span class="output-title">输出内容</span>
        <span class="expand-btn">{{ isExpanded ? '收起' : '展开' }}</span>
      </div>
      <div v-if="isExpanded" class="output-content">
        <pre>{{ truncateOutput(formatOutput(toolCall.output), 100) }}</pre>
      </div>
    </div>
    
    <!-- 提取的知识 -->
    <div v-if="showKnowledge && parsedResult.extractedKnowledge && parsedResult.extractedKnowledge.length > 0" class="knowledge-section">
      <div class="section-header">
        <span class="section-icon">💡</span>
        <span class="section-title">提取的知识 ({{ parsedResult.extractedKnowledge.length }})</span>
      </div>
      <div class="knowledge-list">
        <KnowledgeCardComponent 
          v-for="card in parsedResult.extractedKnowledge"
          :key="card.id"
          :card="card"
          :compact="true"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-result-enhanced {
  background: var(--result-bg);
  border: 1px solid var(--result-color);
  border-radius: 12px;
  margin: 12px 0;
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-result-enhanced:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}

.tool-result-enhanced.type-failure {
  background: rgba(239, 68, 68, 0.05);
}

/* 头部 */
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 16px;
  background: rgba(30, 30, 50, 0.3);
}

.result-main {
  display: flex;
  gap: 12px;
}

.result-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  background: var(--result-bg);
}

.result-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-type {
  font-weight: 700;
  font-size: 15px;
  color: var(--result-color);
}

.result-summary {
  font-size: 13px;
  color: #9ca3af;
  max-width: 500px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

/* 统计 */
.output-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(20, 20, 40, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  font-size: 12px;
}

.stat-icon {
  font-size: 12px;
}

.stat-value {
  font-weight: 600;
  color: #e5e7eb;
}

.stat-label {
  color: #888;
}

.stat-item.error {
  background: rgba(239, 68, 68, 0.1);
}

.stat-item.error .stat-value {
  color: #ef4444;
}

.stat-item.warning {
  background: rgba(245, 158, 11, 0.1);
}

.stat-item.warning .stat-value {
  color: #f59e0b;
}

/* 详情 */
.result-details {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: #9ca3af;
}

.detail-icon {
  color: var(--result-color);
}

/* 输出内容 */
.output-section {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.output-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.output-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.output-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.expand-btn {
  font-size: 11px;
  color: #6b7280;
}

.expand-btn:hover {
  color: #fff;
}

.output-content {
  padding: 0 16px 16px;
}

.output-content pre {
  background: rgba(10, 10, 20, 0.8);
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  color: #4ade80;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.5;
}

/* 知识区域 */
.knowledge-section {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding: 12px 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-icon {
  font-size: 16px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.knowledge-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>

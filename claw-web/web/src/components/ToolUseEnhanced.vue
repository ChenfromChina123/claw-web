<script setup lang="ts">
/**
 * 增强版工具调用展示组件 - 结构化展示工具输入
 */
import { computed, ref } from 'vue'
import { NTag } from 'naive-ui'
import type { ParsedToolInfo } from '@/types/flowKnowledge'
import type { ToolCall } from '@/types/tool'
import { parseToolCall } from '@/utils/toolParser'

const props = defineProps<{
  toolCall: ToolCall
  expanded?: boolean
}>()

const isExpanded = ref(props.expanded ?? false)

// 解析工具信息
const parsedInfo = computed((): ParsedToolInfo => {
  return parseToolCall(props.toolCall)
})

// 获取状态标签
const statusConfig = computed(() => {
  const status = props.toolCall.status
  const configs: Record<string, { label: string; type: string; color: string }> = {
    pending: { label: '等待中', type: 'default', color: '#6b7280' },
    executing: { label: '执行中', type: 'warning', color: '#f59e0b' },
    completed: { label: '完成', type: 'success', color: '#22c55e' },
    error: { label: '错误', type: 'error', color: '#ef4444' }
  }
  return configs[status] || configs.pending
})

// 格式化参数值
function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (value.length > 200) {
      return value.substring(0, 200) + '...'
    }
    return value
  }
  if (Array.isArray(value)) {
    return `[${value.slice(0, 5).map(v => formatParamValue(v)).join(', ')}${value.length > 5 ? ', ...' : ''}]`
  }
  return JSON.stringify(value)
}

// 获取参数类型标签颜色
function getParamTypeColor(type: string): string {
  const colors: Record<string, string> = {
    string: '#3b82f6',
    number: '#8b5cf6',
    boolean: '#f59e0b',
    object: '#06b6d4',
    array: '#10b981'
  }
  return colors[type] || '#6b7280'
}

// 展开/收起
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// 格式化工具输出结果
function formatToolOutput(output: unknown): string {
  if (output === null || output === undefined) return '无结果'
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return output
    }
  }
  if (typeof output === 'object') {
    return JSON.stringify(output, null, 2)
  }
  return String(output)
}
</script>

<template>
  <div class="tool-use-enhanced" :class="[`status-${toolCall.status}`, { expanded: isExpanded }]">
    <!-- 工具头部 -->
    <div class="tool-header" @click="toggleExpand">
      <div class="tool-main">
        <!-- 类别图标 -->
        <div class="tool-icon" :style="{ background: '#6366f1' }">
          🔧
        </div>
        
        <!-- 工具信息 -->
        <div class="tool-info">
          <div class="tool-name-row">
            <span class="tool-name">{{ toolCall.toolName }}</span>
            <span class="tool-category">工具调用</span>
          </div>
          <div class="tool-desc">{{ parsedInfo.description }}</div>
        </div>
      </div>
      
      <div class="tool-status">
        <!-- 参数数量 -->
        <NTooltip trigger="hover">
          <template #trigger>
            <div class="param-count">
              {{ parsedInfo.parameters.length }} 参数
            </div>
          </template>
          参数数量
        </NTooltip>
        
        <!-- 状态标签 -->
        <NTag :type="statusConfig.type as any" size="small" round>
          <template #icon>
            <span v-if="toolCall.status === 'executing'" class="status-spinner">⟳</span>
          </template>
          {{ statusConfig.label }}
        </NTag>
        
        <!-- 展开按钮 -->
        <span class="expand-icon">{{ isExpanded ? '▲' : '▼' }}</span>
      </div>
    </div>
    
    <!-- 参数详情 (展开时) -->
    <div v-if="isExpanded" class="tool-params">
      <div v-if="parsedInfo.parameters.length > 0" class="params-section">
        <div class="params-title">输入参数</div>
        <div class="params-list">
          <div 
            v-for="param in parsedInfo.parameters" 
            :key="param.name"
            class="param-item"
            :class="{ required: param.required }"
          >
            <div class="param-header">
              <span class="param-name">{{ param.name }}</span>
              <span class="param-type" :style="{ color: getParamTypeColor(param.type) }">
                {{ param.type }}
              </span>
              <span v-if="param.required" class="param-required">必填</span>
            </div>
            <div v-if="param.description" class="param-desc">{{ param.description }}</div>
            <div v-if="param.value !== undefined" class="param-value">
              <pre>{{ formatParamValue(param.value) }}</pre>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 工具执行结果 -->
      <div v-if="toolCall.toolOutput" class="result-section">
        <div class="result-title">执行结果</div>
        <div class="result-content">
          <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
        </div>
      </div>
    </div>
    
    <!-- 简要预览 (折叠时) -->
    <div v-if="!isExpanded && parsedInfo.parameters.length > 0" class="tool-preview">
      <div 
        v-for="param in parsedInfo.parameters.slice(0, 2)" 
        :key="param.name"
        class="preview-item"
      >
        <span class="preview-name">{{ param.name }}:</span>
        <span class="preview-value">{{ formatParamValue(param.value) }}</span>
      </div>
      <span v-if="parsedInfo.parameters.length > 2" class="preview-more">
        +{{ parsedInfo.parameters.length - 2 }} 更多参数
      </span>
    </div>
  </div>
</template>

<style scoped>
.tool-use-enhanced {
  background: rgba(30, 30, 60, 0.6);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  margin: 12px 0;
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-use-enhanced:hover {
  border-color: rgba(99, 102, 241, 0.4);
}

.tool-use-enhanced.status-completed {
  border-left: 3px solid #22c55e;
}

.tool-use-enhanced.status-error {
  border-left: 3px solid #ef4444;
  background: rgba(60, 30, 30, 0.3);
}

.tool-use-enhanced.status-executing {
  border-left: 3px solid #f59e0b;
}

.tool-use-enhanced.expanded {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 头部 */
.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.tool-header:hover {
  background: rgba(50, 50, 100, 0.3);
}

.tool-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.tool-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-weight: 700;
  font-size: 15px;
  color: #e5e7eb;
  font-family: 'Monaco', 'Menlo', monospace;
}

.tool-category {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 4px;
  color: #a5b4fc;
}

.tool-desc {
  font-size: 12px;
  color: #9ca3af;
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.param-count {
  font-size: 11px;
  color: #6b7280;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.expand-icon {
  font-size: 10px;
  color: #888;
  margin-left: 4px;
}

.status-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 参数详情 */
.tool-params {
  padding: 0 16px 16px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  margin-top: 0;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.params-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  padding: 12px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-item {
  background: rgba(20, 20, 40, 0.6);
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.param-item.required {
  border-left: 2px solid #f59e0b;
}

.param-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.param-name {
  font-weight: 600;
  font-size: 13px;
  color: #e5e7eb;
  font-family: 'Monaco', 'Menlo', monospace;
}

.param-type {
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  font-weight: 500;
}

.param-required {
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border-radius: 3px;
}

.param-desc {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 6px;
}

.param-value {
  margin-top: 6px;
}

.param-value pre {
  background: rgba(15, 15, 30, 0.8);
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  color: #a5b4fc;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow-y: auto;
}

/* 预览 */
.tool-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  margin-top: 0;
}

.preview-item {
  display: flex;
  gap: 4px;
  font-size: 12px;
  padding: 4px 8px;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 4px;
}

.preview-name {
  color: #888;
}

.preview-value {
  color: #a5b4fc;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Monaco', 'Menlo', monospace;
}

.preview-more {
  font-size: 11px;
  color: #6b7280;
  padding: 4px 8px;
}

/* 结果部分 */
.result-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
}

.result-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  padding: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-content pre {
  background: rgba(15, 15, 30, 0.8);
  padding: 12px;
  border-radius: 8px;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  color: #a5b4fc;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.5;
}
</style>

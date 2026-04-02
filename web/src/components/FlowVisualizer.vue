<script setup lang="ts">
/**
 * 流程可视化组件 - 以时间线形式展示工具执行流程
 */
import { computed, ref } from 'vue'
import { NCard, NTag, NProgress, NTooltip } from 'naive-ui'
import type { FlowGraph, FlowNode, FlowEdge, ToolCall } from '@/types/flowKnowledge'
import { TOOL_CATEGORIES, getToolCategory } from '@/types/flowKnowledge'

const props = defineProps<{
  flowGraph: FlowGraph
  expanded?: boolean
}>()

const isExpanded = ref(props.expanded ?? false)

// 获取节点图标
function getNodeIcon(node: FlowNode): string {
  if (node.type === 'start') return '▶️'
  if (node.type === 'end') return '⏹️'
  
  const category = node.toolName ? getToolCategory(node.toolName) : 'other'
  return TOOL_CATEGORIES[category]?.icon || '📎'
}

// 获取节点颜色
function getNodeColor(node: FlowNode): string {
  if (node.type === 'start') return '#22c55e'
  if (node.type === 'end') return '#6366f1'
  
  const category = node.toolName ? getToolCategory(node.toolName) : 'other'
  return TOOL_CATEGORIES[category]?.color || '#78716c'
}

// 获取状态颜色
function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return '#22c55e'
    case 'running': return '#f59e0b'
    case 'error': return '#ef4444'
    case 'pending': return '#6b7280'
    case 'skipped': return '#9ca3af'
    default: return '#6b7280'
  }
}

// 过滤出工具节点
const toolNodes = computed(() => {
  return props.flowGraph.nodes.filter(n => n.type === 'tool')
})

// 计算总耗时
const totalDuration = computed(() => {
  let duration = 0
  for (const node of toolNodes.value) {
    if (node.duration) {
      duration += node.duration
    }
  }
  return duration
})

// 格式化耗时
function formatDuration(ms?: number): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// 格式化输出预览
function formatOutputPreview(output: unknown): string {
  if (!output) return ''
  if (typeof output === 'string') {
    return output.substring(0, 100) + (output.length > 100 ? '...' : '')
  }
  if (typeof output === 'object') {
    const str = JSON.stringify(output)
    return str.substring(0, 100) + (str.length > 100 ? '...' : '')
  }
  return String(output)
}

// 展开/收起
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// 获取参数预览
function getParameterPreview(input?: Record<string, unknown>): string[] {
  if (!input) return []
  
  const preview: string[] = []
  
  if (input.path) preview.push(`路径: ${input.path}`)
  if (input.file_path) preview.push(`文件: ${input.file_path}`)
  if (input.command) preview.push(`命令: ${input.command}`)
  if (input.query) preview.push(`查询: ${input.query}`)
  if (input.search_term) preview.push(`搜索: ${input.search_term}`)
  
  // 文件列表
  if (input.files_to_read && Array.isArray(input.files_to_read)) {
    preview.push(`文件: ${(input.files_to_read as string[]).slice(0, 3).join(', ')}`)
  }
  
  return preview
}
</script>

<template>
  <div class="flow-visualizer">
    <div class="flow-header" @click="toggleExpand">
      <div class="flow-title">
        <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
        <span class="flow-icon">🔗</span>
        <span class="flow-name">{{ flowGraph.name }}</span>
        <NTag size="small" type="info">{{ toolNodes.length }} 个工具</NTag>
      </div>
      <div class="flow-meta">
        <span class="meta-item">
          <span class="meta-icon">⏱️</span>
          {{ formatDuration(totalDuration) }}
        </span>
      </div>
    </div>
    
    <div v-if="isExpanded" class="flow-timeline">
      <!-- 时间线 -->
      <div class="timeline-line"></div>
      
      <!-- 开始节点 -->
      <div class="timeline-node start-node">
        <div class="node-dot" style="background: #22c55e">
          <span>▶️</span>
        </div>
        <div class="node-content">
          <div class="node-label">开始执行</div>
        </div>
      </div>
      
      <!-- 工具节点 -->
      <div 
        v-for="(node, index) in toolNodes" 
        :key="node.id"
        class="timeline-node tool-node"
        :class="node.status"
      >
        <div class="node-dot" :style="{ background: getNodeColor(node) }">
          <span>{{ getNodeIcon(node) }}</span>
        </div>
        <div class="node-content">
          <div class="node-header">
            <span class="node-label">{{ node.label }}</span>
            <NTag 
              size="tiny" 
              :type="node.status === 'completed' ? 'success' : 
                     node.status === 'error' ? 'error' : 
                     node.status === 'running' ? 'warning' : 'default'">
              {{ node.status === 'completed' ? '完成' : 
                 node.status === 'error' ? '错误' : 
                 node.status === 'running' ? '执行中' : '等待' }}
            </NTag>
          </div>
          
          <!-- 工具名称 -->
          <div class="node-tool-name">{{ node.toolName }}</div>
          
          <!-- 参数预览 -->
          <div v-if="getParameterPreview(node.input).length > 0" class="node-params">
            <div 
              v-for="param in getParameterPreview(node.input)" 
              :key="param"
              class="param-item"
            >
              {{ param }}
            </div>
          </div>
          
          <!-- 输出预览 -->
          <div v-if="node.output && node.status === 'completed'" class="node-output">
            <div class="output-label">输出:</div>
            <div class="output-preview">{{ formatOutputPreview(node.output) }}</div>
          </div>
          
          <!-- 耗时 -->
          <div v-if="node.duration" class="node-duration">
            ⏱️ {{ formatDuration(node.duration) }}
          </div>
        </div>
        
        <!-- 连接线 -->
        <div v-if="index < toolNodes.length - 1" class="timeline-connector">
          <div class="connector-line"></div>
        </div>
      </div>
      
      <!-- 结束节点 -->
      <div class="timeline-node end-node">
        <div class="node-dot" style="background: #6366f1">
          <span>⏹️</span>
        </div>
        <div class="node-content">
          <div class="node-label">执行完成</div>
        </div>
      </div>
    </div>
    
    <!-- 折叠状态下的简要视图 -->
    <div v-else class="flow-summary">
      <div 
        v-for="node in toolNodes.slice(0, 5)" 
        :key="node.id"
        class="summary-node"
        :class="node.status"
      >
        <span class="summary-icon">{{ getNodeIcon(node) }}</span>
        <span class="summary-label">{{ node.label }}</span>
        <span class="summary-status" :style="{ color: getStatusColor(node.status) }">
          {{ node.status === 'completed' ? '✓' : 
             node.status === 'error' ? '✗' : 
             node.status === 'running' ? '⟳' : '○' }}
        </span>
      </div>
      <div v-if="toolNodes.length > 5" class="summary-more">
        +{{ toolNodes.length - 5 }} more
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-visualizer {
  background: rgba(30, 30, 60, 0.5);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  margin: 12px 0;
  overflow: hidden;
}

.flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(40, 40, 80, 0.6);
  cursor: pointer;
  transition: background 0.2s;
}

.flow-header:hover {
  background: rgba(50, 50, 100, 0.6);
}

.flow-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  font-size: 10px;
  color: #888;
  transition: transform 0.2s;
}

.flow-icon {
  font-size: 16px;
}

.flow-name {
  font-weight: 600;
  color: #e5e7eb;
}

.flow-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.meta-icon {
  font-size: 12px;
}

/* 折叠视图 */
.flow-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
}

.summary-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(60, 60, 100, 0.5);
  border-radius: 16px;
  font-size: 12px;
}

.summary-node.completed {
  border-left: 2px solid #22c55e;
}

.summary-node.error {
  border-left: 2px solid #ef4444;
}

.summary-node.running {
  border-left: 2px solid #f59e0b;
}

.summary-icon {
  font-size: 14px;
}

.summary-label {
  color: #e5e7eb;
}

.summary-status {
  font-weight: bold;
}

.summary-more {
  padding: 4px 10px;
  color: #6b7280;
  font-size: 12px;
}

/* 展开视图 */
.flow-timeline {
  position: relative;
  padding: 20px 20px 20px 60px;
}

.timeline-line {
  position: absolute;
  left: 36px;
  top: 40px;
  bottom: 40px;
  width: 2px;
  background: linear-gradient(
    to bottom,
    #22c55e,
    rgba(99, 102, 241, 0.3) 50%,
    #6366f1
  );
}

.timeline-node {
  position: relative;
  margin-bottom: 16px;
}

.timeline-node:last-child {
  margin-bottom: 0;
}

.node-dot {
  position: absolute;
  left: -36px;
  top: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.start-node .node-dot,
.end-node .node-dot {
  width: 24px;
  height: 24px;
}

.start-node .node-dot {
  top: 2px;
}

.end-node .node-dot {
  top: 2px;
}

.node-content {
  background: rgba(40, 40, 80, 0.6);
  border-radius: 8px;
  padding: 12px 16px;
  margin-left: 8px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  transition: border-color 0.2s;
}

.tool-node:hover .node-content {
  border-color: rgba(99, 102, 241, 0.4);
}

.tool-node.completed .node-content {
  border-left: 3px solid #22c55e;
}

.tool-node.error .node-content {
  border-left: 3px solid #ef4444;
  background: rgba(60, 30, 30, 0.3);
}

.tool-node.running .node-content {
  border-left: 3px solid #f59e0b;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.node-label {
  font-weight: 600;
  color: #e5e7eb;
  font-size: 14px;
}

.node-tool-name {
  font-size: 12px;
  color: #a5b4fc;
  font-family: 'Monaco', 'Menlo', monospace;
  margin-bottom: 8px;
}

.node-params {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.param-item {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 4px;
  color: #a5b4fc;
}

.node-output {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(99, 102, 241, 0.2);
}

.output-label {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
}

.output-preview {
  font-size: 12px;
  color: #4ade80;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.node-duration {
  margin-top: 8px;
  font-size: 11px;
  color: #9ca3af;
}

.timeline-connector {
  position: absolute;
  left: -22px;
  top: 100%;
  width: 20px;
  height: 16px;
}

.connector-line {
  position: absolute;
  left: 8px;
  top: 0;
  width: 2px;
  height: 16px;
  background: rgba(99, 102, 241, 0.3);
}

/* 动画 */
.timeline-node {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>

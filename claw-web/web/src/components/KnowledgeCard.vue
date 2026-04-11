<script setup lang="ts">
/**
 * 知识卡片组件 - 以结构化方式展示提取的知识
 */
import { computed, ref } from 'vue'
import { NTag, NTooltip } from 'naive-ui'
import type { KnowledgeCard as KnowledgeCardType, KnowledgeType } from '@/types/flowKnowledge'

const props = defineProps<{
  card: KnowledgeCardType
  compact?: boolean
  showSource?: boolean
}>()

const isExpanded = ref(false)

// 知识类型配置
const KNOWLEDGE_TYPE_CONFIG: Record<KnowledgeType, {
  icon: string
  color: string
  label: string
  bgColor: string
}> = {
  concept: {
    icon: '💡',
    color: '#fbbf24',
    label: '概念',
    bgColor: 'rgba(251, 191, 36, 0.1)'
  },
  fact: {
    icon: '📌',
    color: '#3b82f6',
    label: '事实',
    bgColor: 'rgba(59, 130, 246, 0.1)'
  },
  rule: {
    icon: '📏',
    color: '#8b5cf6',
    label: '规则',
    bgColor: 'rgba(139, 92, 246, 0.1)'
  },
  pattern: {
    icon: '🔄',
    color: '#06b6d4',
    label: '模式',
    bgColor: 'rgba(6, 182, 212, 0.1)'
  },
  relationship: {
    icon: '🔗',
    color: '#10b981',
    label: '关系',
    bgColor: 'rgba(16, 185, 129, 0.1)'
  },
  procedure: {
    icon: '📋',
    color: '#f59e0b',
    label: '步骤',
    bgColor: 'rgba(245, 158, 11, 0.1)'
  },
  example: {
    icon: '📝',
    color: '#6366f1',
    label: '示例',
    bgColor: 'rgba(99, 102, 241, 0.1)'
  },
  warning: {
    icon: '⚠️',
    color: '#f97316',
    label: '警告',
    bgColor: 'rgba(249, 115, 22, 0.1)'
  },
  tip: {
    icon: '✨',
    color: '#22c55e',
    label: '技巧',
    bgColor: 'rgba(34, 197, 94, 0.1)'
  },
  error: {
    icon: '❌',
    color: '#ef4444',
    label: '错误',
    bgColor: 'rgba(239, 68, 68, 0.1)'
  }
}

// 当前卡片配置
const cardConfig = computed(() => {
  return KNOWLEDGE_TYPE_CONFIG[props.card.type] || KNOWLEDGE_TYPE_CONFIG.fact
})

// 格式化置信度
function formatConfidence(confidence?: number): string {
  if (confidence === undefined) return ''
  return `${Math.round(confidence * 100)}%`
}

// 截断内容
function truncateContent(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}
</script>

<template>
  <div 
    class="knowledge-card"
    :class="[`type-${card.type}`, { compact, expanded: isExpanded }]"
    :style="{ '--card-color': cardConfig.color, '--card-bg': cardConfig.bgColor }"
  >
    <!-- 头部 -->
    <div class="card-header" @click="!compact && (isExpanded = !isExpanded)">
      <div class="card-type">
        <span class="type-icon">{{ cardConfig.icon }}</span>
        <span class="type-label">{{ cardConfig.label }}</span>
      </div>
      
      <div class="card-meta">
        <!-- 置信度 -->
        <NTooltip v-if="card.confidence !== undefined" trigger="hover">
          <template #trigger>
            <div class="confidence-badge">
              {{ formatConfidence(card.confidence) }}
            </div>
          </template>
          置信度: {{ formatConfidence(card.confidence) }}
        </NTooltip>
        
        <!-- 展开/收起按钮 -->
        <span v-if="!compact && card.content.length > 100" class="expand-btn">
          {{ isExpanded ? '收起' : '展开' }}
        </span>
      </div>
    </div>
    
    <!-- 标题 -->
    <div class="card-title">{{ card.title }}</div>
    
    <!-- 内容 -->
    <div class="card-content" :class="{ truncated: !isExpanded && card.content.length > 100 }">
      {{ isExpanded || card.content.length <= 100 ? card.content : truncateContent(card.content) }}
    </div>
    
    <!-- 标签 -->
    <div v-if="card.tags && card.tags.length > 0" class="card-tags">
      <NTag
        v-for="tag in card.tags.slice(0, 3)"
        :key="tag"
        size="tiny"
        :bordered="false"
      >
        {{ tag }}
      </NTag>
      <span v-if="card.tags.length > 3" class="more-tags">
        +{{ card.tags.length - 3 }}
      </span>
    </div>
    
    <!-- 来源信息 -->
    <div v-if="showSource && card.source" class="card-source">
      <span class="source-icon">📎</span>
      <span class="source-text">
        来源: {{ card.source.toolName || card.source.nodeId || '未知' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.knowledge-card {
  background: var(--card-bg);
  border: 1px solid var(--card-color);
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  transition: all 0.2s ease;
}

.knowledge-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

.knowledge-card.compact {
  padding: 8px 12px;
}

.knowledge-card.type-error {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}

.knowledge-card.type-warning {
  background: rgba(249, 115, 22, 0.1);
  border-color: #f97316;
}

.knowledge-card.type-tip {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  cursor: pointer;
}

.card-type {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-icon {
  font-size: 14px;
}

.type-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--card-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.confidence-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--card-color);
  font-weight: 600;
}

.expand-btn {
  font-size: 11px;
  color: #888;
  cursor: pointer;
}

.expand-btn:hover {
  color: #fff;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
  color: #e5e7eb;
  margin-bottom: 6px;
  line-height: 1.4;
}

.card-content {
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.card-content.truncated {
  max-height: 80px;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
}

.more-tags {
  font-size: 11px;
  color: #6b7280;
  padding: 2px 6px;
}

.card-source {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  font-size: 11px;
  color: #6b7280;
}

.source-icon {
  font-size: 12px;
}

.source-text {
  font-family: 'Monaco', 'Menlo', monospace;
}
</style>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NButton, NDatePicker, NSelect, NSpin, NEmpty, NTag, NCard, useMessage, NResult } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { SearchOutline, CloseOutline, FilterOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { useChatStore } from '@/stores/chat'
import type { Message } from '@/types'

interface SearchResult {
  message: Message
  sessionTitle: string
  total: number
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  selectMessage: [messageId: string, sessionId: string]
}>()

const message = useMessage()
const chatStore = useChatStore()

const searchKeyword = ref('')
const selectedSessionId = ref<string | null>(null)
const dateRange = ref<[number, number] | null>(null)
const isSearching = ref(false)
const searchResults = ref<SearchResult[]>([])
const totalResults = ref(0)
const currentPage = ref(1)
const pageSize = 20

// 生成会话选项
const sessionOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = [
    { label: '全部会话', value: null }
  ]
  chatStore.sessions.forEach(session => {
    options.push({
      label: session.title || '未命名会话',
      value: session.id
    })
  })
  return options
})

// 搜索状态
const hasSearched = ref(false)

/**
 * 执行搜索
 */
async function handleSearch() {
  if (!searchKeyword.value.trim() && !selectedSessionId.value && !dateRange.value) {
    message.warning('请至少输入一个搜索条件')
    return
  }

  isSearching.value = true
  hasSearched.value = true
  searchResults.value = []
  totalResults.value = 0
  currentPage.value = 1

  try {
    const params = new URLSearchParams()
    
    if (searchKeyword.value.trim()) {
      params.append('keyword', searchKeyword.value.trim())
    }
    
    if (selectedSessionId.value) {
      params.append('sessionId', selectedSessionId.value)
    }
    
    if (dateRange.value) {
      const startDate = new Date(dateRange.value[0])
      const endDate = new Date(dateRange.value[1])
      // 设置结束时间为当天 23:59:59
      endDate.setHours(23, 59, 59, 999)
      
      params.append('startDate', startDate.toISOString())
      params.append('endDate', endDate.toISOString())
    }
    
    params.append('limit', pageSize.toString())
    params.append('offset', '0')

    const response = await fetch(`/api/sessions/messages/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${chatStore.currentSessionId ? 'token' : ''}`,
      },
    })

    const data = await response.json()
    
    if (response.ok) {
      searchResults.value = data.results || []
      totalResults.value = data.total || 0
      
      if (searchResults.value.length === 0) {
        message.info('未找到匹配的消息')
      } else {
        message.success(`找到 ${totalResults.value} 条匹配的消息`)
      }
    } else {
      message.error(data.message || '搜索失败')
    }
  } catch (error: any) {
    console.error('搜索失败:', error)
    message.error('搜索失败，请稍后重试')
  } finally {
    isSearching.value = false
  }
}

/**
 * 清空搜索条件
 */
function handleClearSearch() {
  searchKeyword.value = ''
  selectedSessionId.value = null
  dateRange.value = null
  searchResults.value = []
  totalResults.value = 0
  hasSearched.value = false
}

/**
 * 关闭搜索弹窗
 */
function handleClose() {
  emit('close')
  handleClearSearch()
}

/**
 * 点击搜索结果
 */
function handleResultClick(result: SearchResult) {
  emit('selectMessage', result.message.id, result.message.sessionId)
  handleClose()
}

/**
 * 高亮关键词
 */
function highlightKeyword(text: string, keyword: string): string {
  if (!keyword.trim()) return text
  
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * 格式化日期
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 监听弹窗关闭
 */
watch(() => props.show, (newVal) => {
  if (!newVal) {
    handleClearSearch()
  }
})
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="消息搜索"
    style="width: 800px; max-width: 90vw;"
    :closable="false"
    @close="handleClose"
  >
    <!-- 搜索条件区域 -->
    <div class="search-form">
      <div class="search-form-header">
        <NIcon :size="18" class="form-icon">
          <FilterOutline />
        </NIcon>
        <span class="form-title">搜索条件</span>
      </div>
      
      <div class="search-inputs">
        <div class="search-input-row">
          <NInput
            v-model:value="searchKeyword"
            placeholder="输入关键词搜索消息内容..."
            clearable
            class="keyword-input"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <NIcon :size="16">
                <SearchOutline />
              </NIcon>
            </template>
          </NInput>
          
          <NSelect
            v-model:value="selectedSessionId"
            :options="sessionOptions"
            placeholder="选择会话"
            class="session-select"
            clearable
          />
        </div>
        
        <div class="search-input-row">
          <NDatePicker
            v-model:value="dateRange"
            type="daterange"
            placeholder="选择日期范围"
            class="date-picker"
            clearable
            @update:value="handleSearch"
          />
          
          <div class="search-actions">
            <NButton
              type="primary"
              :loading="isSearching"
              @click="handleSearch"
            >
              搜索
            </NButton>
            <NButton @click="handleClearSearch">
              清空
            </NButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 搜索结果区域 -->
    <div class="search-results">
      <!-- 加载中状态 -->
      <div v-if="isSearching" class="loading-state">
        <NSpin size="large" />
        <p class="loading-text">正在搜索...</p>
      </div>

      <!-- 未搜索状态 -->
      <div v-else-if="!hasSearched" class="empty-state">
        <NResult
          status="info"
          title="请输入搜索条件"
          description="支持关键词、会话、日期范围搜索"
        />
      </div>

      <!-- 搜索结果为空 -->
      <div v-else-if="searchResults.length === 0" class="empty-state">
        <NEmpty description="未找到匹配的消息" />
      </div>

      <!-- 搜索结果列表 -->
      <div v-else class="results-list">
        <div class="results-header">
          <span class="results-count">
            找到 {{ totalResults }} 条匹配的消息
          </span>
        </div>
        
        <div
          v-for="(result, index) in searchResults"
          :key="result.message.id"
          class="result-item"
          @click="handleResultClick(result)"
        >
          <div class="result-header">
            <NTag type="info" size="small" class="role-tag">
              {{ result.message.role === 'user' ? '我' : '助手' }}
            </NTag>
            <span class="session-title">{{ result.sessionTitle }}</span>
            <span class="message-time">{{ formatDate(result.message.createdAt) }}</span>
          </div>
          
          <div class="result-content">
            <div 
              v-if="typeof result.message.content === 'string'"
              class="message-text"
              v-html="highlightKeyword(result.message.content, searchKeyword)"
            ></div>
            <div v-else class="message-text">
              {{ JSON.stringify(result.message.content).substring(0, 200) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <NButton @click="handleClose">关闭</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.search-form {
  margin-bottom: 20px;
  padding: 16px;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.search-form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.form-icon {
  color: var(--color-primary);
}

.form-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.search-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.keyword-input {
  flex: 2;
}

.session-select {
  flex: 1;
  min-width: 150px;
}

.date-picker {
  flex: 1.5;
}

.search-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.search-results {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loading-text {
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.results-count {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
  border: 1px solid transparent;
}

.result-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-accent);
  transform: translateX(4px);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.role-tag {
  font-size: 12px;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}

.message-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.result-content {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.message-text {
  word-break: break-word;
}

.message-text :deep(mark) {
  background: rgba(255, 191, 0, 0.3);
  color: inherit;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 600;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 滚动条样式 */
.search-results::-webkit-scrollbar {
  width: 6px;
}

.search-results::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 3px;
}

.search-results::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: var(--border-accent);
}

/* 响应式适配 */
@media (max-width: 768px) {
  .search-input-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-actions {
    margin-left: 0;
    justify-content: stretch;
  }
  
  .search-actions .n-button {
    flex: 1;
  }
}
</style>

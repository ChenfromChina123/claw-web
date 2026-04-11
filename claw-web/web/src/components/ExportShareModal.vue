<script setup lang="ts">
/**
 * 导出与分享弹窗组件
 * 支持导出为 Markdown/HTML/JSON，以及创建分享链接
 */

import { ref, computed, watch } from 'vue'
import {
  NModal, NCard, NTabs, NTabPane, NButton, NInput, NInputNumber,
  NSelect, NSwitch, NSpin, NEmpty, NIcon, useMessage
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import exportApi, { type ShareInfo, type SharedSession } from '@/api/exportApi'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const message = useMessage()
const chatStore = useChatStore()

/**
 * 弹窗关闭
 */
function handleClose() {
  emit('update:show', false)
}

/**
 * 分享相关状态
 */
const activeTab = ref<'export' | 'share'>('export')
const isExporting = ref(false)
const isSharing = ref(false)
const isLoadingShares = ref(false)

/**
 * 分享表单
 */
const shareTitle = ref('')
const shareExpiresHours = ref<number | null>(null)
const createdShare = ref<ShareInfo | null>(null)
const userShares = ref<SharedSession[]>([])
const shareUrl = ref('')

/**
 * 过期时间选项
 */
const expireOptions: SelectOption[] = [
  { label: '永不过期', value: 0 },
  { label: '1 小时', value: 1 },
  { label: '6 小时', value: 6 },
  { label: '24 小时', value: 24 },
  { label: '7 天', value: 168 },
  { label: '30 天', value: 720 },
]

/**
 * 导出格式选项
 */
const exportFormats = [
  { label: 'Markdown (.md)', value: 'markdown', icon: '📝' },
  { label: 'HTML (.html)', value: 'html', icon: '🌐' },
  { label: 'JSON (.json)', value: 'json', icon: '📋' },
]

/**
 * 当前会话 ID
 */
const currentSessionId = computed(() => chatStore.currentSessionId)

/**
 * 当前会话标题
 */
const currentSessionTitle = computed(() => chatStore.currentSession?.title || '对话')

/**
 * 监听弹窗打开，加载用户分享列表
 */
watch(() => props.show, async (newVal) => {
  if (newVal) {
    activeTab.value = 'export'
    createdShare.value = null
    shareTitle.value = currentSessionTitle.value
    await loadUserShares()
  }
})

/**
 * 加载用户分享列表
 */
async function loadUserShares() {
  isLoadingShares.value = true
  try {
    userShares.value = await exportApi.getUserShares()
  } catch (error) {
    console.error('加载分享列表失败:', error)
  } finally {
    isLoadingShares.value = false
  }
}

/**
 * 导出会话
 * @param format 导出格式
 */
async function handleExport(format: string) {
  if (!currentSessionId.value) {
    message.warning('请先选择会话')
    return
  }

  isExporting.value = true
  try {
    let blob: Blob
    let filename: string

    switch (format) {
      case 'markdown':
        blob = await exportApi.exportAsMarkdown({ sessionId: currentSessionId.value })
        filename = `${currentSessionTitle.value}.md`
        break
      case 'html':
        blob = await exportApi.exportAsHtml({ sessionId: currentSessionId.value })
        filename = `${currentSessionTitle.value}.html`
        break
      case 'json':
        blob = await exportApi.exportAsJson({ sessionId: currentSessionId.value })
        filename = `${currentSessionTitle.value}.json`
        break
      default:
        throw new Error('不支持的格式')
    }

    exportApi.downloadBlob(blob, filename)
    message.success('导出成功')
    handleClose()
  } catch (error: any) {
    console.error('导出失败:', error)
    message.error(error?.message || '导出失败')
  } finally {
    isExporting.value = false
  }
}

/**
 * 创建分享链接
 */
async function handleCreateShare() {
  if (!currentSessionId.value) {
    message.warning('请先选择会话')
    return
  }

  isSharing.value = true
  try {
    const expiresInHours = shareExpiresHours.value && shareExpiresHours.value > 0 ? shareExpiresHours.value : undefined
    const shareInfo = await exportApi.createShare(
      currentSessionId.value,
      shareTitle.value || currentSessionTitle.value,
      expiresInHours
    )
    createdShare.value = shareInfo
    shareUrl.value = shareInfo.shareUrl
    message.success('分享链接已创建')
    await loadUserShares()
  } catch (error: any) {
    console.error('创建分享失败:', error)
    message.error(error?.message || '创建分享失败')
  } finally {
    isSharing.value = false
  }
}

/**
 * 复制分享链接
 */
async function handleCopyShareUrl() {
  if (!shareUrl.value) return

  try {
    await navigator.clipboard.writeText(shareUrl.value)
    message.success('链接已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动复制')
  }
}

/**
 * 删除分享
 */
async function handleDeleteShare(shareId: string) {
  try {
    await exportApi.deleteShare(shareId)
    message.success('分享已删除')
    await loadUserShares()
    if (createdShare.value?.shareId === shareId) {
      createdShare.value = null
      shareUrl.value = ''
    }
  } catch (error: any) {
    console.error('删除分享失败:', error)
    message.error(error?.message || '删除分享失败')
  }
}

/**
 * 格式化过期时间显示
 */
function formatExpiresAt(expiresAt: string | null): string {
  if (!expiresAt) return '永不过期'
  const date = new Date(expiresAt)
  return date.toLocaleString('zh-CN')
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="导出与分享"
    style="width: 520px; max-width: 95vw;"
    :mask-closable="true"
    :closable="true"
    @update:show="handleClose"
  >
    <NTabs v-model:value="activeTab" type="line" animated>
      <!-- 导出标签页 -->
      <NTabPane name="export" tab="📤 导出">
        <div class="export-content">
          <p class="export-tip">选择导出格式，将当前会话内容导出为文件</p>

          <div class="export-buttons">
            <NButton
              v-for="format in exportFormats"
              :key="format.value"
              :loading="isExporting"
              class="export-btn"
              @click="handleExport(format.value)"
            >
              <template #icon>
                <span class="export-icon">{{ format.icon }}</span>
              </template>
              {{ format.label }}
            </NButton>
          </div>

          <div v-if="!currentSessionId" class="export-warning">
            <NEmpty description="暂无会话" size="small" />
          </div>
        </div>
      </NTabPane>

      <!-- 分享标签页 -->
      <NTabPane name="share" tab="🔗 分享">
        <div class="share-content">
          <!-- 创建新分享 -->
          <div class="share-form">
            <h4 class="share-form-title">创建分享链接</h4>

            <div class="form-item">
              <label>分享标题</label>
              <NInput
                v-model:value="shareTitle"
                placeholder="输入分享标题"
                :maxlength="100"
              />
            </div>

            <div class="form-item">
              <label>链接有效期</label>
              <NSelect
                v-model:value="shareExpiresHours"
                :options="expireOptions"
                placeholder="选择过期时间"
              />
            </div>

            <NButton
              type="primary"
              block
              :loading="isSharing"
              :disabled="!currentSessionId"
              @click="handleCreateShare"
            >
              生成分享链接
            </NButton>
          </div>

          <!-- 已创建的分享 -->
          <div v-if="createdShare" class="share-result">
            <h4 class="share-result-title">分享链接已创建</h4>
            <div class="share-url-box">
              <NInput :value="shareUrl" readonly />
              <NButton @click="handleCopyShareUrl">复制</NButton>
            </div>
            <p class="share-meta">
              <span v-if="createdShare.expiresAt">过期时间: {{ formatExpiresAt(createdShare.expiresAt) }}</span>
              <span v-else>永不过期</span>
            </p>
          </div>

          <!-- 历史分享列表 -->
          <div class="share-list">
            <h4 class="share-list-title">我的分享</h4>
            <NSpin :show="isLoadingShares">
              <div v-if="userShares.length === 0" class="share-empty">
                <NEmpty description="暂无分享记录" size="small" />
              </div>
              <div v-else class="share-items">
                <div
                  v-for="share in userShares"
                  :key="share.id"
                  class="share-item"
                >
                  <div class="share-item-info">
                    <span class="share-item-title">{{ share.title }}</span>
                    <span class="share-item-meta">
                      {{ share.isExpired ? '已过期' : `浏览 ${share.viewCount} 次` }}
                      <span v-if="!share.isExpired && share.expiresAt">
                        · {{ formatExpiresAt(share.expiresAt) }}
                      </span>
                    </span>
                  </div>
                  <div class="share-item-actions">
                    <NButton size="small" @click="handleCopyShareUrl">
                      复制
                    </NButton>
                    <NButton
                      size="small"
                      type="error"
                      @click="handleDeleteShare(share.id)"
                    >
                      删除
                    </NButton>
                  </div>
                </div>
              </div>
            </NSpin>
          </div>
        </div>
      </NTabPane>
    </NTabs>
  </NModal>
</template>

<style scoped>
.export-content {
  padding: 16px 0;
}

.export-tip {
  color: var(--text-secondary, #888);
  margin-bottom: 20px;
  font-size: 14px;
}

.export-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-btn {
  justify-content: flex-start;
  padding: 12px 16px;
  height: auto;
}

.export-icon {
  font-size: 18px;
  margin-right: 8px;
}

.export-warning {
  margin-top: 20px;
}

.share-content {
  padding: 16px 0;
}

.share-form {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.share-form-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--text-primary, #fff);
}

.form-item {
  margin-bottom: 16px;
}

.form-item label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.share-result {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.share-result-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #34d399;
}

.share-url-box {
  display: flex;
  gap: 8px;
}

.share-url-box :deep(.n-input) {
  flex: 1;
}

.share-meta {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.share-list {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.share-list-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-primary, #fff);
}

.share-empty {
  padding: 20px 0;
}

.share-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.share-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.share-item-title {
  font-size: 14px;
  color: var(--text-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-item-meta {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.share-item-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}
</style>

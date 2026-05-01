<template>
  <NModal
    :show="show"
    preset="card"
    :title="title"
    :style="{ width: '90vw', maxWidth: '1200px', height: '85vh' }"
    :mask-closable="true"
    @update:show="$emit('update:show', $event)"
  >
    <template #header-extra>
      <NSpace align="center" :size="8">
        <NButton
          v-if="previewUrl"
          size="small"
          type="primary"
          @click="openInNewTab"
        >
          <template #icon>
            <NIcon><OpenOutline /></NIcon>
          </template>
          新窗口打开
        </NButton>
        <NButton
          size="small"
          @click="refreshPreview"
        >
          <template #icon>
            <NIcon><RefreshOutline /></NIcon>
          </template>
          刷新
        </NButton>
      </NSpace>
    </template>

    <div class="website-preview-container">
      <div v-if="loading" class="website-preview-loading">
        <NSpin size="large" />
        <p>正在加载预览...</p>
      </div>

      <div v-else-if="error" class="website-preview-error">
        <NIcon size="48" color="#e88080"><AlertCircleOutline /></NIcon>
        <p>{{ error }}</p>
        <NButton @click="refreshPreview">重试</NButton>
      </div>

      <div v-else-if="!previewUrl" class="website-preview-empty">
        <NIcon size="48" color="#909399"><GlobeOutline /></NIcon>
        <p>暂无预览地址</p>
        <p class="website-preview-empty-hint">请先发布项目以获取预览地址</p>
      </div>

      <iframe
        v-else
        ref="iframeRef"
        :src="previewUrl"
        class="website-preview-iframe"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="clipboard-read; clipboard-write"
        @load="onIframeLoad"
      />
    </div>

    <template #footer>
      <NSpace justify="space-between" align="center">
        <NText depth="3" style="font-size: 12px">
          {{ previewUrl || '无预览地址' }}
        </NText>
        <NSpace>
          <NButton
            v-if="previewUrl"
            size="small"
            @click="copyUrl"
          >
            <template #icon>
              <NIcon><CopyOutline /></NIcon>
            </template>
            复制链接
          </NButton>
          <NButton
            v-if="previewUrl"
            size="small"
            type="primary"
            @click="openInNewTab"
          >
            在浏览器中打开
          </NButton>
        </NSpace>
      </NSpace>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton, NIcon, NSpace, NSpin, NText, useMessage } from 'naive-ui'
import {
  OpenOutline,
  RefreshOutline,
  AlertCircleOutline,
  GlobeOutline,
  CopyOutline
} from '@vicons/ionicons5'

const props = defineProps<{
  show: boolean
  previewUrl: string
  title?: string
  projectId?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const message = useMessage()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading = ref(false)
const error = ref('')

watch(() => props.show, (val) => {
  if (val) {
    error.value = ''
    loading.value = !!props.previewUrl
  }
})

function onIframeLoad() {
  loading.value = false
  error.value = ''
}

function refreshPreview() {
  if (iframeRef.value && props.previewUrl) {
    loading.value = true
    error.value = ''
    iframeRef.value.src = props.previewUrl
  }
}

function openInNewTab() {
  if (props.previewUrl) {
    window.open(props.previewUrl, '_blank')
  }
}

async function copyUrl() {
  if (props.previewUrl) {
    try {
      await navigator.clipboard.writeText(props.previewUrl)
      message.success('链接已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }
}
</script>

<style scoped>
.website-preview-container {
  width: 100%;
  height: calc(85vh - 160px);
  min-height: 400px;
  position: relative;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.website-preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
}

.website-preview-loading,
.website-preview-error,
.website-preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: #666;
}

.website-preview-empty-hint {
  font-size: 13px;
  color: #999;
}
</style>

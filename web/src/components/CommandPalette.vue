<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NScrollbar, NEmpty } from 'naive-ui'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [command: string]
}>()

const searchValue = ref('')

const commands = [
  { id: 'new', name: '新建会话', description: '创建一个新的对话会话', icon: '➕', shortcut: 'Ctrl+N' },
  { id: 'clear', name: '清空会话', description: '清除当前会话的所有消息', icon: '🗑️', shortcut: 'Ctrl+L' },
  { id: 'export', name: '导出会话', description: '将当前会话导出为 JSON 或 Markdown', icon: '📤', shortcut: 'Ctrl+E' },
  { id: 'model', name: '切换模型', description: '更改 AI 模型的设置', icon: '🤖', shortcut: 'Ctrl+M' },
  { id: 'tools', name: '工具列表', description: '查看所有可用的工具', icon: '🔧', shortcut: 'Ctrl+T' },
  { id: 'help', name: '帮助', description: '查看帮助文档和快捷键', icon: '❓', shortcut: 'Ctrl+?' },
]

const filteredCommands = computed(() => {
  if (!searchValue.value) return commands
  const query = searchValue.value.toLowerCase()
  return commands.filter(cmd => 
    cmd.name.toLowerCase().includes(query) || 
    cmd.description.toLowerCase().includes(query)
  )
})

watch(() => props.show, (show) => {
  if (show) {
    searchValue.value = ''
  }
})

function handleSelect(command: typeof commands[0]) {
  emit('select', command.id)
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :style="{ width: '500px', maxWidth: '90vw' }"
    :mask-closable="true"
    @update:show="handleClose"
  >
    <template #header>
      <div class="command-palette-header">
        <span>命令面板</span>
      </div>
    </template>
    
    <div class="command-palette">
      <div class="search-box">
        <NInput
          v-model:value="searchValue"
          placeholder="搜索命令..."
          size="large"
          autofocus
        >
          <template #prefix>
            <span>🔍</span>
          </template>
        </NInput>
      </div>
      
      <NScrollbar class="command-list">
        <div v-if="filteredCommands.length === 0">
          <NEmpty description="未找到匹配的命令" />
        </div>
        <div
          v-for="command in filteredCommands"
          :key="command.id"
          class="command-item"
          @click="handleSelect(command)"
        >
          <div class="command-icon">{{ command.icon }}</div>
          <div class="command-info">
            <div class="command-name">{{ command.name }}</div>
            <div class="command-description">{{ command.description }}</div>
          </div>
          <div v-if="command.shortcut" class="command-shortcut">
            {{ command.shortcut }}
          </div>
        </div>
      </NScrollbar>
      
      <div class="command-footer">
        <span>按 ESC 关闭</span>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.command-palette-header {
  font-weight: 600;
}

.command-palette {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-box {
  margin-bottom: 8px;
}

.command-list {
  max-height: 400px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.command-item:hover {
  background: var(--bg-secondary);
}

.command-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.command-info {
  flex: 1;
}

.command-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.command-description {
  font-size: 12px;
  color: var(--text-secondary);
}

.command-shortcut {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
}

.command-footer {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
</style>

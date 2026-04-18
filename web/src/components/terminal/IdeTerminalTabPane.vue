<script setup lang="ts">
/**
 * IdeTerminalTabPane - 单个终端标签页面板
 * 
 * 每个标签页拥有独立的 PTY 会话、xterm 实例和工具输出订阅。
 * 父组件 IdeTerminalTabs 通过 ref 调用 writeAgentOutput() 写入 Agent 输出。
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { usePTY } from '@/composables/usePTY'
import { featureConfig } from '@/config/features'
import { useIdeAppendToChat } from '@/composables/useIdeChatAppend'

const props = withDefaults(
  defineProps<{
    tabId: string
    defaultCwd?: string
    connectToBackend?: boolean
    shellType?: 'powershell' | 'cmd' | 'bash' | 'auto'
    scrollback?: number
    /** 是否将 Agent Bash/PowerShell 输出写入此终端 */
    mirrorAgentShell?: boolean
  }>(),
  {
    defaultCwd: '',
    connectToBackend: featureConfig.ptyShell.enabled,
    shellType: featureConfig.ptyShell.defaultShell,
    scrollback: 1200,
    mirrorAgentShell: true,
  }
)

const emit = defineEmits<{
  (e: 'ready', term: Terminal): void
  (e: 'sessionCreated', sessionId: string): void
  (e: 'sessionClosed'): void
}>()

const mountRef = ref<HTMLElement | null>(null)
const term = shallowRef<Terminal | null>(null)
const fitAddon = shallowRef<FitAddon | null>(null)
const searchAddon = shallowRef<SearchAddon | null>(null)
let resizeObserver: ResizeObserver | null = null
let wsUnsubs: Array<() => void> = []
let wsClientRef: typeof import('@/composables/useWebSocket').default | null = null

// 连接状态
const connectionStatus = ref<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected')
const errorMessage = ref<string | null>(null)

// 跟踪当前活跃的 Bash / PowerShell 工具 id
const shellToolIds = new Set<string>()

// Windows 平台输入缓存（解决换行问题）
let inputBuffer = ''
const isWindowsPlatform = navigator.platform.includes('Win')

// 输出缓冲区：批量写入避免光标位置混乱
let outputBuffer = ''
let outputFlushScheduled = false

/**
 * 规范化终端输出的换行符
 * 确保 \r\n 配对完整，避免光标位置不同步
 */
function normalizeTerminalOutput(data: string): string {
  return data.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

/**
 * 安全地写入终端（带缓冲）
 * 使用 requestAnimationFrame 批量写入，减少 xterm.js 光标重算次数
 */
function safeTermWrite(term: Terminal, data: string): void {
  outputBuffer += data
  if (!outputFlushScheduled) {
    outputFlushScheduled = true
    requestAnimationFrame(() => {
      if (outputBuffer) {
        term.write(outputBuffer)
        outputBuffer = ''
      }
      outputFlushScheduled = false
    })
  }
}

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuRef = ref<HTMLElement | null>(null)

/** 获取注入的"添加到对话"函数 */
const appendToChat = useIdeAppendToChat()

/** 最大添加到对话的字符数（超过则截断） */
const MAX_APPEND_LENGTH = 8000

// ==================== Agent 输出镜像 ====================

async function setupAgentMirror() {
  const wc = await import('@/composables/useWebSocket')
  wsClientRef = wc.default

  function onToolStart(data: unknown) {
    const d = data as { id?: string; name?: string; toolName?: string }
    const name = d.name ?? d.toolName
    if (d.id && (name === 'Bash' || name === 'PowerShell')) {
      shellToolIds.add(d.id)
    }
  }

  function onToolEndOrError(data: unknown) {
    const d = data as { id?: string }
    if (d?.id) shellToolIds.delete(d.id)
  }

  function onToolProgress(data: unknown) {
    if (!props.mirrorAgentShell || !term.value) return
    const d = data as { id?: string; output?: string; toolName?: string; name?: string }
    if (typeof d.output !== 'string' || !d.output) return
    const tn = d.toolName || d.name
    const isShell =
      (d.id && shellToolIds.has(d.id)) ||
      tn === 'Bash' ||
      tn === 'PowerShell' ||
      /^\$ /.test(d.output)
    if (!isShell) return
    // 统一使用规范化后的换行符，确保光标同步
    safeTermWrite(term.value, normalizeTerminalOutput(d.output))
  }

  wsUnsubs = [
    wsClientRef.on('tool_start', onToolStart),
    wsClientRef.on('tool_end', onToolEndOrError),
    wsClientRef.on('tool_error', onToolEndOrError),
    wsClientRef.on('tool_progress', onToolProgress),
  ]
}

// ==================== PTY ====================

// Windows 平台首次启动时用于过滤 prompt 命令回显
let isFirstOutput = true

const pty = usePTY({
  shell: props.shellType,
  cwd: props.defaultCwd,
  onOutput: (data: string, type: 'stdout' | 'stderr' | 'exit', exitCode?: number) => {
    if (!term.value) return
    const t = term.value

    if (type === 'stderr') {
      // 使用 write + \r\n 而非 writeln，确保光标回到行首
      safeTermWrite(t, `\x1b[31m${normalizeTerminalOutput(data)}\x1b[0m\r\n`)
    } else if (type === 'exit') {
      safeTermWrite(t, `\r\n\x1b[33m[Process exited with code ${exitCode ?? 0}]\x1b[0m\r\n`)
      connectionStatus.value = 'disconnected'
    } else {
      // 规范化换行符，确保 \r\n 配对完整
      let normalizedData = normalizeTerminalOutput(data)

      // Windows 平台：智能过滤空行（保留格式）
      if (isWindowsPlatform && normalizedData) {
        // 按行分割时保留 \r
        const lines = normalizedData.split('\n')
        const processedLines: string[] = []

        for (const line of lines) {
          // 移除行尾的 \r 用于检查，但保留原始内容
          const lineContent = line.replace(/\r$/, '')
          // 只过滤纯空行（可能由命令回显产生），保留包含空格的行
          if (lineContent.trim() === '' && processedLines.length > 0) {
            // 检查前一行是否也是空行，避免连续空行
            const prevLine = processedLines[processedLines.length - 1].replace(/\r$/, '')
            if (prevLine.trim() !== '') {
              processedLines.push(line)
            }
          } else {
            processedLines.push(line)
          }
        }

        if (processedLines.length > 0) {
          normalizedData = processedLines.join('\n')
        } else {
          return
        }
      }

      // Windows 平台：改进的输入回显过滤
      // 只过滤完全匹配输入缓冲区的纯回显，不过滤包含命令的正常输出
      if (isWindowsPlatform && inputBuffer.length > 0) {
        // 检查是否为纯输入回显（以 prompt 开头 + 输入内容）
        const echoPattern = new RegExp(`^.*${inputBuffer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
        if (echoPattern.test(normalizedData.trim())) {
          return
        }
      }

      safeTermWrite(t, normalizedData)
    }
  },
})

async function connectToPTY(): Promise<void> {
  if (!props.connectToBackend) return
  if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return

  connectionStatus.value = 'connecting'
  errorMessage.value = null

  try {
    const sessionId = await pty.createSession({
      shell: props.shellType,
      cwd: props.defaultCwd,
      cols: 120,
      rows: 30,
    })

    if (sessionId) {
      connectionStatus.value = 'connected'
      pty.subscribeToOutput()
      emit('sessionCreated', sessionId)
    } else {
      connectionStatus.value = 'error'
      errorMessage.value = pty.error.value || 'Failed to connect'
    }
  } catch (err) {
    connectionStatus.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

async function disconnectFromPTY(): Promise<void> {
  if (connectionStatus.value === 'disconnected') return
  pty.unsubscribeAll()
  await pty.destroySession()
  connectionStatus.value = 'disconnected'
  emit('sessionClosed')
}

async function resizePTY(cols: number, rows: number): Promise<void> {
  if (connectionStatus.value !== 'connected') return
  await pty.resize(cols, rows)
}

// ==================== 终端初始化 ====================

function disposeTerminal(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
  for (const u of wsUnsubs) u()
  wsUnsubs = []
  if (connectionStatus.value === 'connected') {
    void disconnectFromPTY()
  }
  term.value?.dispose()
  term.value = null
  fitAddon.value = null
  searchAddon.value = null
}

function onWindowResize(): void {
  fitAddon.value?.fit()
  if (connectionStatus.value === 'connected') {
    const dims = fitAddon.value?.proposeDimensions()
    if (dims) void resizePTY(dims.cols, dims.rows)
  }
}

async function initTerminal(): Promise<void> {
  if (term.value || !mountRef.value) return

  const t = new Terminal({
    cursorBlink: true,
    scrollback: props.scrollback,
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, "Cascadia Mono", "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
      black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
      blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
      brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
      brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
      brightCyan: '#29b8db', brightWhite: '#e5e5e5',
    },
    allowProposedApi: true,
  })

  const fit = new FitAddon()
  t.loadAddon(fit)

  const search = new SearchAddon()
  t.loadAddon(search)
  searchAddon.value = search

  t.open(mountRef.value)
  fit.fit()

  term.value = t
  fitAddon.value = fit

  // 初始化时，尝试连接后端 PTY
  // 即使 defaultCwd 为空，后端也会使用默认工作目录
  if (props.connectToBackend) {
    safeTermWrite(t, '\x1b[36mConnecting to backend shell...\x1b[0m\r\n')
    await connectToPTY()
    if (connectionStatus.value === 'connected') {
      t.clear()
      safeTermWrite(t, `\x1b[32mConnected to ${pty.session.value?.shell || 'shell'}\x1b[0m\r\n\r\n`)
    } else {
      safeTermWrite(t, `\x1b[31mFailed to connect: ${errorMessage.value || 'Unknown error'}\x1b[0m\r\n`)
      connectionStatus.value = 'disconnected'
    }
  } else {
    safeTermWrite(t, `\x1b[2;37mLocal mode (no backend PTY)\x1b[0m\r\n`)
    t.write('\r\n')
  }

  // 发送数据到 PTY
  t.onData(async (data: string) => {
    console.log('[TerminalTabPane] onData called, connectionStatus:', connectionStatus.value, 'data:', JSON.stringify(data))
    if (connectionStatus.value === 'connected') {
      // Windows 平台：本地回显，回车后发送完整命令
      if (isWindowsPlatform) {
        // 收到回车键，发送缓存的输入到后端执行
        if (data === '\r') {
          if (inputBuffer.length > 0) {
            // 本地显示换行
            t.write('\r\n')
            // 发送命令到后端
            await pty.write(inputBuffer + '\r\n')
            inputBuffer = ''
          } else {
            t.write('\r\n')
            await pty.write('\r\n')
          }
        } else if (data === '\n') {
          // 忽略单独的换行符
        } else if (data === '\x7f') {
          // 退格键
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1)
            // 本地显示退格效果
            t.write('\b \b')
          }
        } else {
          // 其他字符，添加到缓存并本地显示
          inputBuffer += data
          t.write(data)
        }
      } else {
        // 非 Windows 平台：直接发送
        await pty.write(data)
      }
    } else {
      console.log('[TerminalTabPane] onData ignored - not connected')
    }
  })

  // 添加快捷键支持
  t.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    // 支持 Ctrl+U 添加选中的内容到对话
    if (event.ctrlKey && event.key === 'u') {
      appendSelectionToChat()
      return false
    }
    return true
  })

  resizeObserver = new ResizeObserver(() => {
    fit.fit()
    if (connectionStatus.value === 'connected') {
      const dims = fit.proposeDimensions()
      if (dims) void resizePTY(dims.cols, dims.rows)
    }
  })
  resizeObserver.observe(mountRef.value)
  window.addEventListener('resize', onWindowResize)

  requestAnimationFrame(() => {
    fit.fit()
    t.focus()
  })

  emit('ready', t)
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await setupAgentMirror()
  await nextTick()
  await initTerminal()
})

onBeforeUnmount(() => {
  disposeTerminal()
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('click', hideContextMenu)
})

// ==================== 右键菜单 ====================

function showContextMenu(e: MouseEvent) {
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  contextMenuVisible.value = true
  document.addEventListener('click', hideContextMenu)
}

function hideContextMenu() {
  contextMenuVisible.value = false
  document.removeEventListener('click', hideContextMenu)
}

function copySelectedText() {
  const selection = term.value?.getSelection()
  if (selection) {
    navigator.clipboard.writeText(selection).catch(() => {})
  }
  hideContextMenu()
}

async function copyAllText() {
  if (!term.value) return
  const buffer = term.value.buffer
  const text = buffer.activeBuffer.lines
    .toString()
    .replace(/\r?\n/g, '\r\n')
  await navigator.clipboard.writeText(text).catch(() => {})
  hideContextMenu()
}

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      if (isWindowsPlatform) {
        // Windows 平台：直接写入
        await pty.write(text)
      } else {
        await pty.write(text)
      }
    }
  } catch {}
  hideContextMenu()
}

/**
 * 获取终端选中的文本并添加到对话
 * 如果文本过长，则进行截断并在末尾添加省略号
 * 以芯片（chip）形式显示在输入框中
 */
function appendSelectionToChat(): void {
  const t = term.value
  if (!t) return

  // 获取选中的文本
  let selection = t.getSelection()

  // 如果没有选中文本，尝试获取全部可见内容
  if (!selection || !selection.trim()) {
    const buffer = t.buffer
    const lines: string[] = []
    for (let i = 0; i < buffer.activeBuffer.length; i++) {
      const line = buffer.activeBuffer.getLine(i)
      if (line) {
        lines.push(line.translateToString(true))
      }
    }
    selection = lines.join('\n').trim()
  }

  if (!selection || !selection.trim()) return

  // 清理文本：移除 ANSI 转义序列
  let cleanedText = selection.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

  const originalLength = cleanedText.length

  // 截断过长的文本
  let finalContent = cleanedText
  if (cleanedText.length > MAX_APPEND_LENGTH) {
    finalContent = cleanedText.slice(0, MAX_APPEND_LENGTH) + '\n\n...（内容已截断，原文较长）'
  }

  // 生成预览文本（取前80字符用于芯片显示）
  const preview = cleanedText.slice(0, 80).replace(/\n/g, ' ') + (cleanedText.length > 80 ? '...' : '')

  // 调用注入的函数将文本添加到对话（以芯片形式）
  if (appendToChat) {
    appendToChat(finalContent, {
      terminalRef: {
        preview,
        content: finalContent,
        originalLength,
      },
    })
  }
}

// cwd 变化时重建连接（从空变为有效目录时也触发首次连接）
watch(
  () => props.defaultCwd,
  async (cwd) => {
    if (!cwd) return
    // 如果已在连接中或已连接，等待即可
    if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return

    const t = term.value
    if (!t) return

    // 断开旧连接（如果存在）
    if (connectionStatus.value === 'connected') {
      await disconnectFromPTY()
      await nextTick()
    }

    // 连接到后端 PTY
    safeTermWrite(t, '\x1b[36mConnecting to backend shell...\x1b[0m\r\n')
    await connectToPTY()

    if (connectionStatus.value === 'connected') {
      t.clear()
      safeTermWrite(t, `\x1b[32mConnected to ${pty.session.value?.shell || 'shell'}\x1b[0m\r\n\r\n`)
    } else if (connectionStatus.value === 'error' && t) {
      safeTermWrite(t, `\x1b[31m${errorMessage.value || '连接失败'}\x1b[0m\r\n`)
    }
  },
  { flush: 'post' }
)

// ==================== 公开 API（供父组件调用） ====================

defineExpose({
  /** 写入 Agent 输出文本（用于镜像到当前激活 tab） */
  writeAgentOutput(text: string) {
    const t = term.value
    if (!t) return
    safeTermWrite(t, normalizeTerminalOutput(text))
  },

  /** 写入一行带前缀的命令 */
  writePromptLine(command: string, prompt = '\x1b[32m$\x1b[0m ') {
    const t = term.value
    if (!t) return
    safeTermWrite(t, `\r\n${prompt}\x1b[37m${command}\x1b[0m`)
  },

  /** 获取 PTY sessionId */
  getSessionId() {
    return pty.sessionId.value
  },

  /** 获取连接状态 */
  getConnectionStatus() {
    return connectionStatus.value
  },

  /** 获取焦点 */
  focus() {
    term.value?.focus()
  },

  /** 清空终端 */
  clear() {
    term.value?.clear()
  },

  /** 聚焦时重新 fit */
  onActivate() {
    nextTick(() => {
      fitAddon.value?.fit()
      term.value?.focus()
    })
  },

  /** 添加选中内容到对话 */
  appendSelectionToChat,
})
</script>

<template>
  <div class="terminal-tab-pane">
    <div ref="mountRef" class="terminal-xterm-mount" @contextmenu.prevent="showContextMenu" />
    <!-- 自定义右键菜单 -->
    <div
      v-if="contextMenuVisible"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="copySelectedText">复制选中内容</div>
      <div class="context-menu-item" @click="appendSelectionToChat(); hideContextMenu()">添加到对话</div>
      <div class="context-menu-item" @click="copyAllText">复制全部</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="pasteText">粘贴</div>
    </div>
  </div>
</template>

<style scoped>
.terminal-tab-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #1e1e1e;
}

.terminal-xterm-mount {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 4px 8px 8px;
  box-sizing: border-box;
}

.terminal-xterm-mount :deep(.xterm) {
  height: 100%;
}

/* 右键菜单样式 */
.context-menu {
  position: absolute;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #ddd;
}

.context-menu-item:hover {
  background: #4a4a4a;
}

.context-menu-divider {
  height: 1px;
  background: #555;
  margin: 4px 0;
}

.terminal-xterm-mount :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>

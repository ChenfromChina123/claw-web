<script setup lang="ts">
/**
 * IDE 底部终端面板：VS Code 风格标签栏 + xterm.js + PTY 集成
 * 
 * 支持两种模式：
 * 1. 本地模拟模式（默认）- 本地回显，无需后端
 * 2. 真实后端 Shell 模式 - 通过 WebSocket + PTY 连接到后端真实 shell
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { usePTY } from '@/composables/usePTY'
import { featureConfig } from '@/config/features'
import wsClient from '@/composables/useWebSocket'
import {
  loadTerminalPrefs,
  saveTerminalPrefs,
  loadTerminalSessionLog,
  saveTerminalSessionLog,
  exportTerminalLogBlob,
  type IdeTerminalPrefs,
} from '@/composables/useIdeTerminalPersistence'

type BottomTab = 'terminal' | 'debug' | 'output'

const props = withDefaults(
  defineProps<{
    /** 限制回滚行数，降低低内存环境压力 */
    scrollback?: number
    /** 是否连接到后端真实 Shell（默认由 features.ts 中的配置决定） */
    connectToBackend?: boolean
    /** 后端 Shell 类型：powershell, cmd, bash, auto */
    shellType?: 'powershell' | 'cmd' | 'bash' | 'auto'
    /** 默认工作目录 */
    defaultCwd?: string
    /** 当前对话会话 ID，用于本地缓冲按会话持久化 */
    sessionId?: string
  }>(),
  {
    scrollback: 1200,
    connectToBackend: featureConfig.ptyShell.enabled,
    shellType: featureConfig.ptyShell.defaultShell,
    defaultCwd: '',
    sessionId: '',
  }
)

const emit = defineEmits<{
  (e: 'ready', term: Terminal): void
  (e: 'sessionCreated', sessionId: string): void
  (e: 'sessionClosed'): void
  (e: 'connectionStatusChange', status: 'connected' | 'connecting' | 'disconnected' | 'error'): void
}>()

const activeTab = ref<BottomTab>('terminal')
const terminalMountRef = ref<HTMLElement | null>(null)
const term = shallowRef<Terminal | null>(null)
const fitAddon = shallowRef<FitAddon | null>(null)
const searchAddon = shallowRef<SearchAddon | null>(null)
let resizeObserver: ResizeObserver | null = null

// 连接状态
const connectionStatus = ref<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected')
const errorMessage = ref<string | null>(null)

// 本地模拟模式的状态
const PROMPT = '\x1b[32magent@sandbox\x1b[0m:\x1b[34m~/workspace\x1b[0m$ '

/** 与当前对话绑定的终端文本缓冲（含 PTY + Agent Shell 镜像），写入 localStorage */
const accumulatedLog = ref('')
const terminalPrefs = ref<IdeTerminalPrefs>(loadTerminalPrefs())
/** 跟踪 Bash / PowerShell 工具 id，用于匹配仅有 { id, output } 的 tool_progress */
const shellToolIds = new Set<string>()
let saveLogTimer: ReturnType<typeof setTimeout> | null = null
let wsUnsubs: Array<() => void> = []

function normalizeForXterm(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function appendToPersistentLog(chunk: string): void {
  if (!chunk) return
  accumulatedLog.value += chunk
  if (saveLogTimer) clearTimeout(saveLogTimer)
  saveLogTimer = setTimeout(() => {
    saveLogTimer = null
    saveTerminalSessionLog(props.sessionId, accumulatedLog.value)
  }, 500)
}

function flushPersistentLog(): void {
  if (saveLogTimer) {
    clearTimeout(saveLogTimer)
    saveLogTimer = null
  }
  saveTerminalSessionLog(props.sessionId, accumulatedLog.value)
}

watch(
  () => props.sessionId,
  (newId, oldId) => {
    if (newId === oldId) return
    flushPersistentLog()
    accumulatedLog.value = loadTerminalSessionLog(newId)
    const t = term.value
    if (!t) return
    t.clear()
    if (accumulatedLog.value.trim()) {
      t.writeln('\x1b[2;37m—— 已加载该对话保存的终端记录 ——\x1b[0m')
      t.write(normalizeForXterm(accumulatedLog.value))
    }
    if (props.connectToBackend && connectionStatus.value === 'connected') {
      t.writeln(
        `\x1b[36m[会话 ${(newId || '…').slice(0, 8)}…] 后端 Shell 连接未断开；上方为本地保存记录。\x1b[0m\r\n`
      )
    }
  }
)

watch(
  terminalPrefs,
  (p) => {
    saveTerminalPrefs(p)
  },
  { deep: true }
)

function handleToolStart(data: unknown): void {
  const d = data as { id?: string; name?: string; toolName?: string }
  const name = d.name ?? d.toolName
  if (d.id && (name === 'Bash' || name === 'PowerShell')) {
    shellToolIds.add(d.id)
  }
}

function handleToolEndOrError(data: unknown): void {
  const d = data as { id?: string }
  if (d?.id) shellToolIds.delete(d.id)
}

function handleAgentToolProgress(data: unknown): void {
  if (!terminalPrefs.value.mirrorAgentShell || !term.value) return
  const d = data as { id?: string; output?: string; toolName?: string; name?: string }
  if (typeof d.output !== 'string' || !d.output) return
  const tn = d.toolName || d.name
  const isShell =
    (d.id && shellToolIds.has(d.id)) ||
    tn === 'Bash' ||
    tn === 'PowerShell' ||
    /^\$ /.test(d.output)
  if (!isShell) return
  term.value.write(normalizeForXterm(d.output))
  appendToPersistentLog(d.output)
}

// PTY hook
const pty = usePTY({
  shell: props.shellType,
  cwd: props.defaultCwd,
  onOutput: (data: string, type: 'stdout' | 'stderr' | 'exit', exitCode?: number) => {
    if (term.value) {
      if (type === 'stderr') {
        term.value.writeln(`\x1b[31m${data}\x1b[0m`)
        appendToPersistentLog(data)
      } else if (type === 'exit') {
        term.value.writeln(`\r\n\x1b[33m[Process exited with code ${exitCode ?? 0}]\x1b[0m`)
        appendToPersistentLog(`\n[Process exited with code ${exitCode ?? 0}]\n`)
        connectionStatus.value = 'disconnected'
      } else {
        term.value.write(data)
        appendToPersistentLog(data)
      }
    }
  },
})

// 连接状态文本
const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'error': return `Error: ${errorMessage.value}`
    default: return 'Local Mode'
  }
})

// 连接状态颜色
const connectionStatusColor = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return '#23d18b'
    case 'connecting': return '#e5e510'
    case 'error': return '#f14c4c'
    default: return '#888888'
  }
})

// ==================== 真实 Shell 模式 ====================

/**
 * 连接到后端 PTY
 */
async function connectToPTY(): Promise<boolean> {
  if (!props.connectToBackend) return false
  if (connectionStatus.value === 'connected') return true
  if (connectionStatus.value === 'connecting') return false

  connectionStatus.value = 'connecting'
  errorMessage.value = null
  emit('connectionStatusChange', 'connecting')

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
      emit('connectionStatusChange', 'connected')
      return true
    } else {
      connectionStatus.value = 'error'
      errorMessage.value = pty.error.value || 'Failed to connect'
      emit('connectionStatusChange', 'error')
      return false
    }
  } catch (err) {
    connectionStatus.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : String(err)
    emit('connectionStatusChange', 'error')
    return false
  }
}

/**
 * 断开后端 PTY
 */
async function disconnectFromPTY(): Promise<void> {
  if (connectionStatus.value === 'disconnected') return

  pty.unsubscribeAll()
  await pty.destroySession()

  connectionStatus.value = 'disconnected'
  emit('sessionClosed')
  emit('connectionStatusChange', 'disconnected')
}

/**
 * 发送输入到后端 PTY
 */
async function sendToPTY(data: string): Promise<void> {
  if (connectionStatus.value !== 'connected') return
  await pty.write(data)
}

/**
 * 调整后端 PTY 尺寸
 */
async function resizePTY(cols: number, rows: number): Promise<void> {
  if (connectionStatus.value !== 'connected') return
  await pty.resize(cols, rows)
}

// ==================== 终端初始化 ====================

function disposeTerminal(): void {
  flushPersistentLog()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', onWindowResize)

  // 断开 PTY 连接
  if (connectionStatus.value === 'connected') {
    void disconnectFromPTY()
  }

  const t = term.value
  if (t) {
    t.dispose()
    term.value = null
  }
  fitAddon.value = null
  searchAddon.value = null
}

function onWindowResize(): void {
  fitAddon.value?.fit()

  // 如果连接了后端，同步调整终端大小
  if (connectionStatus.value === 'connected' && term.value) {
    const dims = fitAddon.value?.proposeDimensions()
    if (dims) {
      void resizePTY(dims.cols, dims.rows)
    }
  }
}

async function initTerminal(): Promise<void> {
  if (term.value || !terminalMountRef.value) return

  accumulatedLog.value = loadTerminalSessionLog(props.sessionId)

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
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5',
    },
    allowProposedApi: true,
    // 支持复制粘贴
    rightClickSelectsWord: true,
    // 禁用 xterm.js 的默认粘贴处理，让我们自己处理
    convertEol: false,
  })

  const fit = new FitAddon()
  t.loadAddon(fit)

  // 添加搜索功能
  const search = new SearchAddon()
  t.loadAddon(search)
  searchAddon.value = search

  t.open(terminalMountRef.value)
  fit.fit()

  term.value = t
  fitAddon.value = fit

  // 添加粘贴事件处理
  t.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    // 支持 Ctrl+V 粘贴
    if (event.ctrlKey && event.key === 'v') {
      navigator.clipboard.readText().then(text => {
        if (connectionStatus.value === 'connected') {
          void sendToPTY(text)
        } else {
          // 本地模式：直接写入
          t.write(text)
        }
      }).catch(() => {})
      return false
    }
    // 支持 Ctrl+C 复制（选中的文本）
    if (event.ctrlKey && event.key === 'c') {
      const selection = t.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {})
      }
      return false
    }
    return true
  })

  // 根据模式选择初始化方式
  if (props.connectToBackend) {
    await initBackendMode(t)
  } else {
    initLocalMode(t)
  }

  resizeObserver = new ResizeObserver(() => {
    fit.fit()
    if (connectionStatus.value === 'connected') {
      const dims = fit.proposeDimensions()
      if (dims) {
        void resizePTY(dims.cols, dims.rows)
      }
    }
  })
  resizeObserver.observe(terminalMountRef.value)
  window.addEventListener('resize', onWindowResize)

  requestAnimationFrame(() => {
    fit.fit()
    t.focus()
  })

  emit('ready', t)
}

/**
 * 初始化本地模拟模式
 */
function initLocalMode(t: Terminal): void {
  if (accumulatedLog.value.trim()) {
    t.writeln('\x1b[2;37m—— 本地保存的终端记录 ——\x1b[0m')
    t.write(normalizeForXterm(accumulatedLog.value))
    t.writeln('')
  } else {
    t.writeln(`${PROMPT}\x1b[37mnpm install --silent\x1b[0m`)
    t.writeln('\x1b[2;37m... fetching packages from registry\x1b[0m')
    t.writeln('')
    t.writeln(`${PROMPT}ls -la`)
    t.writeln(
      'drwxr-xr-x  \x1b[34mconfig/\x1b[0m  \x1b[34mdata/\x1b[0m  \x1b[34mskills/\x1b[0m'
    )
  }
  t.write(`\r\n${PROMPT}`)

  let line = ''

  t.onData((data: string) => {
    if (data === '\r') {
      t.writeln('')
      if (line.trim()) {
        t.writeln(`\x1b[2;37m(local demo) ${line}\x1b[0m`)
      }
      line = ''
      t.write(PROMPT)
      return
    }
    if (data === '\u007f' || data === '\b') {
      if (line.length > 0) {
        line = line.slice(0, -1)
        t.write('\b \b')
      }
      return
    }
    if (data < ' ') return
    line += data
    t.write(data)
  })
}

/**
 * 初始化后端 PTY 模式
 */
async function initBackendMode(t: Terminal): Promise<void> {
  const connected = await connectToPTY()
  if (!connected) {
    t.writeln(`\x1b[31mFailed to connect: ${errorMessage.value || 'Unknown error'}\x1b[0m`)
    t.writeln('\x1b[33mFalling back to local mode...\x1b[0m')
    connectionStatus.value = 'disconnected'
    // 回退到本地模式
    initLocalMode(t)
    return
  }

  t.clear()
  if (accumulatedLog.value.trim()) {
    t.writeln('\x1b[2;37m—— 本地保存的终端记录 ——\x1b[0m')
    t.write(normalizeForXterm(accumulatedLog.value))
    t.writeln('')
  }

  // 设置数据处理 - 发送到后端
  t.onData(async (data: string) => {
    if (connectionStatus.value !== 'connected') return
    
    // 发送到后端 PTY
    await sendToPTY(data)
    
    // 本地回显（bash 应该会回显，但以防万一）
    // 回车、换行、退格等特殊字符需要特殊处理
    if (data === '\r') {
      t.write('\r\n')
      return
    }
    if (data === '\n' || data === '\x1b') {
      // 换行或 ESC 字符，让后端处理
      return
    }
    if (data === '\b' || data === '\x7f') {
      // 退格：删除前一个字符
      t.write('\b \b')
      return
    }
    if (data === '\t') {
      // Tab：发送 4 个空格
      t.write('    ')
      return
    }
    // 其他可打印字符：本地回显（bash 应该会回显，但作为备用）
    // 注意：这可能导致双回显，但如果 bash 没有回显，这个就很重要
    const charCode = data.charCodeAt(0)
    if (charCode >= 32 && charCode <= 126) {
      t.write(data)
    }
  })
}

watch(
  activeTab,
  (tab) => {
    if (tab !== 'terminal') {
      disposeTerminal()
      return
    }
    void nextTick(() => initTerminal())
  },
  { flush: 'post' }
)

onMounted(() => {
  wsUnsubs = [
    wsClient.on('tool_start', handleToolStart),
    wsClient.on('tool_end', handleToolEndOrError),
    wsClient.on('tool_error', handleToolEndOrError),
    wsClient.on('tool_progress', handleAgentToolProgress),
  ]
  if (activeTab.value === 'terminal') {
    void nextTick(() => initTerminal())
  }
})

onBeforeUnmount(() => {
  for (const u of wsUnsubs) u()
  wsUnsubs = []
  disposeTerminal()
})

// ==================== 事件处理 ====================

function onTabClick(tab: BottomTab): void {
  activeTab.value = tab
}

function downloadTerminalLog(): void {
  const blob = exportTerminalLogBlob(accumulatedLog.value)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ide-terminal-${(props.sessionId || 'log').slice(0, 12)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function clearTerminal(): void {
  const t = term.value
  if (!t) return
  t.clear()
  accumulatedLog.value = ''
  flushPersistentLog()
  if (props.connectToBackend && connectionStatus.value === 'connected') {
    // 后端模式显示提示
    t.writeln(`\x1b[32m[Terminal cleared]\x1b[0m`)
  } else {
    // 本地模式显示提示
    t.write(PROMPT)
  }
}

async function onNewSession(): Promise<void> {
  if (activeTab.value !== 'terminal') {
    activeTab.value = 'terminal'
    await nextTick()
  }

  // 销毁旧的 PTY 会话
  if (connectionStatus.value === 'connected') {
    await disconnectFromPTY()
  }

  // 清空终端显示和保存的日志
  const t = term.value
  if (t) {
    t.clear()
    accumulatedLog.value = ''  // 清空保存的日志
  }

  // 重新初始化终端
  disposeTerminal()
  await nextTick()

  if (props.connectToBackend) {
    // 后端模式：先显示新会话提示
    const t = term.value
    if (t) {
      t.writeln('\x1b[36m[Starting new session...]\x1b[0m')
    }

    // 连接 PTY
    const connected = await connectToPTY()
    if (connected && term.value) {
      term.value.writeln(`\x1b[32m[New session started]\x1b[0m`)
      term.value.writeln('')  // 空行
    }
  } else {
    // 本地模式：显示提示符
    const t = term.value
    if (t) {
      initLocalMode(t)
    }
  }
}

/**
 * 搜索终端内容
 */
function searchTerminal(pattern: string, forward = true): void {
  if (!searchAddon.value) return
  if (forward) {
    searchAddon.value.findNext(pattern)
  } else {
    searchAddon.value.findPrevious(pattern)
  }
}

/**
 * 清除搜索高亮
 */
function clearSearch(): void {
  if (!searchAddon.value) return
  // SearchAddon 没有 clearSelection/clearDecorations
  // 只清除激活的装饰即可
  searchAddon.value.clearActiveDecoration()
}

// ==================== 公开 API ====================

defineExpose({
  /** 供「在终端运行」等能力注入一行命令 */
  runLine: (command: string) => {
    const t = term.value
    if (!t || activeTab.value !== 'terminal') return

    if (props.connectToBackend && connectionStatus.value === 'connected') {
      // 后端模式：发送命令到 PTY
      void sendToPTY(command + '\r')
    } else {
      // 本地模式：本地回显
      t.writeln(`${PROMPT}\x1b[37m${command.replace(/\r?\n/g, '')}\x1b[0m`)
      t.write(PROMPT)
    }
  },

  /** 获取焦点 */
  focusTerminal: () => {
    term.value?.focus()
  },

  /** 获取当前会话 ID */
  getSessionId: () => {
    return pty.sessionId.value
  },

  /** 获取连接状态 */
  getConnectionStatus: () => {
    return connectionStatus.value
  },

  /** 重新连接 */
  reconnect: async () => {
    await disconnectFromPTY()
    await nextTick()
    await initTerminal()
  },

  /** 断开连接 */
  disconnect: () => {
    return disconnectFromPTY()
  },

  /** 搜索 */
  search: searchTerminal,

  /** 清除搜索 */
  clearSearch,

  /** 导出当前缓冲为文本文件 */
  exportLog: downloadTerminalLog,
})
</script>

<template>
  <div class="ide-terminal-panel">
    <div class="ide-terminal-tabs">
      <div class="ide-terminal-tabs-left">
        <button
          type="button"
          class="ide-terminal-tab"
          :class="{ active: activeTab === 'terminal' }"
          @click="onTabClick('terminal')"
        >
          TERMINAL
        </button>
        <button
          type="button"
          class="ide-terminal-tab"
          :class="{ active: activeTab === 'debug' }"
          @click="onTabClick('debug')"
        >
          DEBUG CONSOLE
        </button>
        <button
          type="button"
          class="ide-terminal-tab"
          :class="{ active: activeTab === 'output' }"
          @click="onTabClick('output')"
        >
          OUTPUT
        </button>
      </div>
      <div class="ide-terminal-tabs-right">
        <!-- 连接状态指示器 -->
        <div
          v-if="connectToBackend"
          class="terminal-status"
          :title="connectionStatusText"
        >
          <span
            class="status-dot"
            :style="{ backgroundColor: connectionStatusColor }"
          />
          <span class="status-text">{{ connectionStatusText }}</span>
        </div>

        <label
          class="terminal-agent-mirror"
          title="将右侧 Agent 的 Bash / PowerShell 工具输出同步到底部终端并随对话持久化"
        >
          <input v-model="terminalPrefs.mirrorAgentShell" type="checkbox" />
          <span>Agent Shell</span>
        </label>

        <button
          type="button"
          class="ide-terminal-icon-btn"
          title="导出终端日志（本地已保存缓冲）"
          aria-label="导出终端日志"
          @click="downloadTerminalLog"
        >
          ⬇
        </button>

        <button
          type="button"
          class="ide-terminal-icon-btn"
          title="新建终端会话"
          aria-label="新建终端会话"
          @click="onNewSession"
        >
          +
        </button>
        <button
          type="button"
          class="ide-terminal-icon-btn"
          title="清空终端"
          aria-label="清空终端"
          @click="clearTerminal"
        >
          🗑️
        </button>
      </div>
    </div>

    <div class="ide-terminal-body">
      <div
        v-show="activeTab === 'terminal'"
        ref="terminalMountRef"
        class="ide-terminal-xterm"
      />

      <div v-if="activeTab === 'debug'" class="ide-terminal-placeholder">
        Debug Console 未连接。构建并接入调试适配器后可在此显示日志。
      </div>
      <div v-if="activeTab === 'output'" class="ide-terminal-placeholder">
        Output 通道暂无数据。任务与扩展输出可挂载到此标签页。
      </div>
    </div>
  </div>
</template>

<style scoped>
.ide-terminal-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: #1e1e1e;
  border-top: 1px solid #333;
}

.ide-terminal-tabs {
  flex-shrink: 0;
  height: 35px;
  padding: 0 8px 0 12px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  background: #252526;
  border-bottom: 1px solid #333;
  font-size: 11px;
  letter-spacing: 0.4px;
}

.ide-terminal-tabs-left {
  display: flex;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
}

.ide-terminal-tab {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  padding: 0 10px;
  font: inherit;
  text-transform: uppercase;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.ide-terminal-tab:hover {
  color: rgba(255, 255, 255, 0.85);
}

.ide-terminal-tab.active {
  color: #fff;
  border-bottom-color: #fff;
}

.ide-terminal-tabs-right {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.75;
}

.ide-terminal-tabs-right:hover {
  opacity: 1;
}

/* 连接状态指示器 */
.terminal-status {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.terminal-agent-mirror {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.terminal-agent-mirror input {
  accent-color: #23d18b;
  cursor: pointer;
}

.ide-terminal-icon-btn {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ide-terminal-icon-btn:hover {
  background: #37373d;
  color: #fff;
}

.ide-terminal-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.ide-terminal-xterm {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 4px 8px 8px;
  box-sizing: border-box;
}

.ide-terminal-xterm :deep(.xterm) {
  height: 100%;
}

.ide-terminal-xterm :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.ide-terminal-xterm :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}

.ide-terminal-xterm :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: #333;
  border-radius: 4px;
}

.ide-terminal-xterm :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: #444;
}

.ide-terminal-placeholder {
  flex: 1;
  padding: 12px 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
}
</style>

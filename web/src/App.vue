<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import ChatMessage from './components/ChatMessage.vue'
import ChatInput from './components/ChatInput.vue'
import SessionSidebar from './components/SessionSidebar.vue'

interface ToolBlock {
  id: string
  name: string
  input: string
  status: 'pending' | 'executing' | 'completed' | 'error'
  result?: string
  progress?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolBlock[]
}

interface Session {
  id: string
  title: string
  model: string
  updatedAt: string
}

const messages = ref<Message[]>([])
const sessions = ref<Session[]>([])
const currentSessionId = ref<string | null>(null)
const isLoading = ref(false)
const currentModel = ref('qwen-plus')
const error = ref('')
const ws = ref<WebSocket | null>(null)
const isConnected = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const showSidebar = ref(true)
const userId = ref<string | null>(null)

let messageIdCounter = 0
let currentAssistantMessageId: string | null = null

function generateId(): string {
  return `msg_${++messageIdCounter}`
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//localhost:3000/ws`

  ws.value = new WebSocket(wsUrl)

  ws.value.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
    error.value = ''
    registerUser()
  }

  ws.value.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handleWebSocketMessage(data)
    } catch (e) {
      console.error('Failed to parse message:', e)
    }
  }

  ws.value.onerror = () => {
    error.value = 'WebSocket connection error'
  }

  ws.value.onclose = () => {
    console.log('WebSocket disconnected')
    isConnected.value = false
    setTimeout(connectWebSocket, 3000)
  }
}

function registerUser() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'register' }))
  }
}

function handleWebSocketMessage(data: any) {
  console.log('Received:', data)

  switch (data.type) {
    case 'registered':
      userId.value = data.userId
      console.log('User registered:', data.userId)
      loadSessions()
      break

    case 'session_list':
      sessions.value = data.sessions || []
      break

    case 'session_created':
      const newSession: Session = {
        id: data.session.id,
        title: data.session.title,
        model: data.session.model,
        updatedAt: data.session.updatedAt,
      }
      sessions.value.unshift(newSession)
      loadSession(data.session.id)
      break

    case 'session_loaded':
      currentSessionId.value = data.session.id
      messages.value = (data.messages || []).map((m: any) => ({
        id: generateId(),
        role: m.role,
        content: m.content,
        toolCalls: [],
      }))
      if (data.toolCalls && data.toolCalls.length > 0) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          data.toolCalls.forEach((tc: any) => {
            lastMsg.toolCalls.push({
              id: tc.id,
              name: tc.toolName,
              input: typeof tc.toolInput === 'object' ? JSON.stringify(tc.toolInput, null, 2) : String(tc.toolInput || ''),
              status: tc.status === 'completed' ? 'completed' : tc.status === 'error' ? 'error' : 'pending',
              result: tc.toolOutput ? (typeof tc.toolOutput === 'object' ? JSON.stringify(tc.toolOutput, null, 2) : String(tc.toolOutput)) : undefined,
            })
          })
        }
      }
      scrollToBottom()
      break

    case 'session_deleted':
      sessions.value = sessions.value.filter(s => s.id !== data.sessionId)
      if (currentSessionId.value === data.sessionId) {
        currentSessionId.value = null
        messages.value = []
        if (sessions.value.length > 0) {
          loadSession(sessions.value[0].id)
        }
      }
      break

    case 'session_renamed':
      const session = sessions.value.find(s => s.id === data.sessionId)
      if (session) {
        session.title = data.title
      }
      break

    case 'session_cleared':
      messages.value = []
      break

    case 'message_start':
      isLoading.value = true
      currentAssistantMessageId = generateId()
      messages.value.push({
        id: currentAssistantMessageId,
        role: 'assistant',
        content: '',
        toolCalls: [],
      })
      break

    case 'content_block_delta':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content += data.text
        }
      } else {
        messages.value.push({
          id: generateId(),
          role: 'assistant',
          content: data.text,
          toolCalls: [],
        })
      }
      scrollToBottom()
      break

    case 'tool_use':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.toolCalls.push({
            id: data.id,
            name: data.name,
            input: typeof data.input === 'object' ? JSON.stringify(data.input, null, 2) : String(data.input || ''),
            status: 'pending',
          })
        }
      }
      scrollToBottom()
      break

    case 'tool_input_delta':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls.length > 0) {
          const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
          lastTool.input += data.partial_json
        }
      }
      scrollToBottom()
      break

    case 'tool_start':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls.length > 0) {
          lastMsg.toolCalls[lastMsg.toolCalls.length - 1].status = 'executing'
        }
      }
      break

    case 'tool_progress':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls.length > 0) {
          const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
          lastTool.progress = (lastTool.progress || '') + data.output
        }
      }
      scrollToBottom()
      break

    case 'tool_end':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls.length > 0) {
          const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
          lastTool.status = 'completed'
          lastTool.result = typeof data.result === 'object' ? JSON.stringify(data.result, null, 2) : String(data.result)
        }
      }
      scrollToBottom()
      break

    case 'tool_error':
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls.length > 0) {
          const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
          lastTool.status = 'error'
          lastTool.result = data.error
        }
      }
      scrollToBottom()
      break

    case 'message_stop':
      isLoading.value = false
      currentAssistantMessageId = null
      break

    case 'error':
      error.value = data.message
      isLoading.value = false
      currentAssistantMessageId = null
      break
  }
}

function loadSessions() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'list_sessions' }))
  }
}

function createSession() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'create_session',
      title: `新对话 ${sessions.value.length + 1}`,
      model: currentModel.value,
    }))
  }
}

function loadSession(sessionId: string) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'load_session',
      sessionId,
    }))
  }
}

function deleteSession(sessionId: string) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'delete_session',
      sessionId,
    }))
  }
}

function renameSession(sessionId: string) {
  const session = sessions.value.find(s => s.id === sessionId)
  if (session && ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'rename_session',
      sessionId,
      title: session.title,
    }))
  }
}

async function handleSend(text: string) {
  if (!isConnected.value) {
    error.value = 'Not connected to server'
    return
  }

  if (!currentSessionId.value) {
    createSession()
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  messages.value.push({
    id: generateId(),
    role: 'user',
    content: text,
    toolCalls: [],
  })

  isLoading.value = true
  error.value = ''
  scrollToBottom()

  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'user_message',
      sessionId: currentSessionId.value,
      content: text,
      model: currentModel.value,
    }))
  }
}

function clearChat() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN && currentSessionId.value) {
    ws.value.send(JSON.stringify({
      type: 'clear_session',
      sessionId: currentSessionId.value,
    }))
  }
  messages.value = []
  error.value = ''
  currentAssistantMessageId = null
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
}

function formatToolInput(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return input
  }
}

onMounted(() => {
  connectWebSocket()
})

onUnmounted(() => {
  if (ws.value) {
    ws.value.close()
  }
})
</script>

<template>
  <div class="app-container">
    <header class="header">
      <div class="header-left">
        <button class="menu-btn" @click="toggleSidebar">☰</button>
        <h1>Claude Code Haha</h1>
      </div>
      <div class="controls">
        <select v-model="currentModel">
          <option value="qwen-plus">qwen-plus</option>
          <option value="qwen-turbo">qwen-turbo</option>
          <option value="qwen-max">qwen-max</option>
        </select>
        <button @click="clearChat" class="clear-btn">清除对话</button>
      </div>
    </header>

    <div class="main-content">
      <SessionSidebar
        v-if="showSidebar"
        :sessions="sessions"
        :current-session-id="currentSessionId"
        @select="loadSession"
        @create="createSession"
        @delete="deleteSession"
        @rename="renameSession"
      />

      <div class="chat-area">
        <div class="connection-status" :class="{ connected: isConnected }">
          {{ isConnected ? '已连接' : '连接中...' }}
        </div>

        <div ref="messagesContainer" class="messages-container">
          <div v-if="messages.length === 0" class="welcome">
            <h2>👋 欢迎使用 Claude Code Haha</h2>
            <p>支持完整工具调用的 Web UI</p>
            <div class="tools-list">
              <h3>可用工具:</h3>
              <ul>
                <li><code>Bash</code> - 执行 Shell 命令</li>
                <li><code>FileRead</code> - 读取文件</li>
                <li><code>FileWrite</code> - 写入文件</li>
                <li><code>FileEdit</code> - 编辑文件</li>
                <li><code>Grep</code> - 代码搜索</li>
                <li><code>Glob</code> - 文件匹配</li>
              </ul>
            </div>
          </div>

          <template v-for="msg in messages" :key="msg.id">
            <ChatMessage :role="msg.role" :content="msg.content">
              <template v-if="msg.toolCalls.length > 0" #tool-calls>
                <div v-for="tool in msg.toolCalls" :key="tool.id" class="inline-tool" :class="tool.status">
                  <div class="tool-header">
                    <span class="tool-icon">⏺</span>
                    <span class="tool-name">{{ tool.name }}</span>
                    <span v-if="tool.status === 'executing'" class="tool-status">执行中...</span>
                    <span v-else-if="tool.status === 'completed'" class="tool-status completed">✓</span>
                    <span v-else-if="tool.status === 'error'" class="tool-status error">✗</span>
                  </div>
                  <div class="tool-content">
                    <pre class="tool-input">{{ formatToolInput(tool.input) }}</pre>
                    <div v-if="tool.progress" class="tool-progress">
                      <span class="progress-label">输出:</span>
                      <pre class="progress-output">{{ tool.progress }}</pre>
                    </div>
                    <div v-if="tool.result" class="tool-result">
                      <pre>{{ tool.result }}</pre>
                    </div>
                  </div>
                </div>
              </template>
            </ChatMessage>
          </template>

          <div v-if="isLoading && messages.length > 0" class="loading">
            <span class="spinner"></span>
            <span>Claude 正在思考...</span>
          </div>

          <div v-if="error" class="error-message">{{ error }}</div>
        </div>

        <ChatInput @send="handleSend" :disabled="!isConnected" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a2e;
  color: #eee;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-btn {
  background: none;
  border: none;
  color: #eee;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.menu-btn:hover {
  color: #e94560;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  color: #e94560;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.controls select {
  padding: 6px 10px;
  background: #0f3460;
  border: 1px solid #e94560;
  color: #eee;
  border-radius: 6px;
  font-size: 13px;
}

.clear-btn {
  padding: 6px 14px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.clear-btn:hover {
  background: #d63850;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.connection-status {
  padding: 6px 16px;
  background: #0f3460;
  font-size: 12px;
  text-align: center;
}

.connection-status.connected {
  background: #1a5f4a;
  color: #4ade80;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.welcome {
  text-align: center;
  padding: 32px 16px;
  color: #888;
}

.welcome h2 {
  color: #e94560;
  margin-bottom: 12px;
}

.tools-list {
  margin-top: 20px;
  text-align: left;
  max-width: 360px;
  margin-left: auto;
  margin-right: auto;
  background: #16213e;
  padding: 14px;
  border-radius: 8px;
}

.tools-list h3 {
  color: #e94560;
  margin-bottom: 10px;
  font-size: 14px;
}

.tools-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tools-list li {
  padding: 5px 0;
  font-size: 13px;
}

.tools-list code {
  background: #0f3460;
  padding: 2px 6px;
  border-radius: 4px;
  color: #4ade80;
}

.inline-tool {
  background: #1e1e3f;
  border: 1px solid #3a3a6a;
  border-radius: 8px;
  margin: 10px 0;
  overflow: hidden;
}

.inline-tool.executing {
  border-color: #f59e0b;
}

.inline-tool.completed {
  border-color: #22c55e;
}

.inline-tool.error {
  border-color: #ef4444;
}

.inline-tool .tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #252550;
  border-bottom: 1px solid #3a3a6a;
}

.inline-tool.executing .tool-header {
  background: #2f2520;
  border-bottom-color: #f59e0b;
}

.inline-tool .tool-icon {
  font-size: 13px;
}

.inline-tool .tool-name {
  font-weight: bold;
  color: #a78bfa;
}

.inline-tool .tool-status {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #3a3a6a;
  color: #888;
}

.inline-tool .tool-status.completed {
  background: #22c55e;
  color: white;
}

.inline-tool .tool-status.error {
  background: #ef4444;
  color: white;
}

.inline-tool .tool-content {
  padding: 10px 14px;
}

.inline-tool .tool-input {
  background: #16162a;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
  color: #e0e0e0;
}

.inline-tool .tool-progress {
  margin-top: 10px;
}

.inline-tool .progress-label {
  font-size: 11px;
  color: #888;
  display: block;
  margin-bottom: 4px;
}

.inline-tool .progress-output {
  background: #0d0d1a;
  padding: 6px;
  border-radius: 4px;
  font-size: 10px;
  overflow-x: auto;
  margin: 0;
  color: #4ade80;
  max-height: 120px;
  overflow-y: auto;
}

.inline-tool .tool-result {
  margin-top: 10px;
  background: #1a2f1a;
  border-radius: 4px;
  padding: 6px;
}

.inline-tool .tool-result pre {
  margin: 0;
  color: #4ade80;
  font-size: 12px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  color: #888;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #0f3460;
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  background: #dc2626;
  color: white;
  padding: 10px 14px;
  border-radius: 8px;
  margin: 12px 0;
}
</style>

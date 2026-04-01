<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import ChatMessage from './components/ChatMessage.vue'
import ChatInput from './components/ChatInput.vue'
import SessionSidebar from './components/SessionSidebar.vue'
import AuthPage from './components/AuthPage.vue'
import { authApi, type LoginResponse } from './services/authApi'

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
  isStreaming?: boolean
}

interface Session {
  id: string
  title: string
  model: string
  updatedAt: string
}

const isLoggedIn = ref(false)
const loginUsername = ref('')
const loginError = ref('')
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
const userUsername = ref<string | null>(null)
const userEmail = ref<string | null>(null)
const authToken = ref<string | null>(null)

const LOCALSTORAGE_TOKEN_KEY = 'auth_token'
const LOCALSTORAGE_USER_KEY = 'user_info'

function saveAuthToStorage(token: string, user: LoginResponse) {
  localStorage.setItem(LOCALSTORAGE_TOKEN_KEY, token)
  localStorage.setItem(LOCALSTORAGE_USER_KEY, JSON.stringify(user))
}

function loadAuthFromStorage(): { token: string; user: LoginResponse } | null {
  const token = localStorage.getItem(LOCALSTORAGE_TOKEN_KEY)
  const userStr = localStorage.getItem(LOCALSTORAGE_USER_KEY)
  if (token && userStr) {
    try {
      return { token, user: JSON.parse(userStr) }
    } catch {
      return null
    }
  }
  return null
}

function clearAuthFromStorage() {
  localStorage.removeItem(LOCALSTORAGE_TOKEN_KEY)
  localStorage.removeItem(LOCALSTORAGE_USER_KEY)
}

function handleLoginSuccess(user: LoginResponse) {
  authToken.value = localStorage.getItem(LOCALSTORAGE_TOKEN_KEY)
  userId.value = user.userId
  loginUsername.value = user.username
  userUsername.value = user.username
  userEmail.value = user.email
  isLoggedIn.value = true

  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({
      type: 'login',
      token: authToken.value,
    }))
  }
}

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

    const savedAuth = loadAuthFromStorage()
    if (savedAuth) {
      authToken.value = savedAuth.token
      userId.value = savedAuth.user.userId
      loginUsername.value = savedAuth.user.username
      userUsername.value = savedAuth.user.username
      userEmail.value = savedAuth.user.email
      isLoggedIn.value = true

      ws.value?.send(JSON.stringify({
        type: 'login',
        token: savedAuth.token,
      }))
    }
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

function handleWebSocketMessage(data: any) {
  console.log('Received:', data)

  switch (data.type) {
    case 'registered':
      userId.value = data.userId
      loginUsername.value = data.username || loginUsername.value
      userUsername.value = data.username || loginUsername.value
      isLoggedIn.value = true
      console.log('User registered:', data.userId)
      loadSessions()
      break

    case 'logged_in':
      userId.value = data.userId
      loadSessions()
      break

    case 'user_validated':
      isLoggedIn.value = true
      loadSessions()
      break

    case 'user_invalid':
      clearAuthFromStorage()
      userId.value = null
      userUsername.value = null
      userEmail.value = null
      authToken.value = null
      isLoggedIn.value = false
      break

    case 'session_list':
      sessions.value = data.sessions || []
      if (sessions.value.length > 0 && !currentSessionId.value) {
        loadSession(sessions.value[0].id)
      }
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

      const assistantMsg = messages.value[messages.value.length - 1]
      if (assistantMsg && assistantMsg.role === 'assistant' && data.toolCalls && data.toolCalls.length > 0) {
        const toolCallMap = new Map<string, any>()
        data.toolCalls.forEach((tc: any) => {
          toolCallMap.set(tc.id, tc)
        })

        for (let i = messages.value.length - 2; i >= 0; i--) {
          const msg = messages.value[i]
          if (msg.role === 'user' && typeof msg.content === 'string') {
            try {
              const parsed = JSON.parse(msg.content)
              if (parsed && parsed.tool_use_id && parsed.name) {
                const toolId = parsed.tool_use_id
                const toolCall = toolCallMap.get(toolId)
                if (toolCall) {
                  assistantMsg.toolCalls.push({
                    id: toolId,
                    name: toolCall.toolName || parsed.name,
                    input: typeof toolCall.toolInput === 'object' ? JSON.stringify(toolCall.toolInput, null, 2) : String(toolCall.toolInput || ''),
                    status: toolCall.status === 'completed' ? 'completed' : toolCall.status === 'error' ? 'error' : 'pending',
                    result: toolCall.toolOutput ? (typeof toolCall.toolOutput === 'object' ? JSON.stringify(toolCall.toolOutput, null, 2) : String(toolCall.toolOutput)) : (parsed.result || parsed.error ? (typeof (parsed.result || parsed.error) === 'object' ? JSON.stringify(parsed.result || parsed.error, null, 2) : String(parsed.result || parsed.error)) : undefined),
                  })
                  msg.content = '[已解析的工具调用结果]'
                }
              }
            } catch (e) {
            }
          }
        }

        data.toolCalls.forEach((tc: any) => {
          const alreadyAdded = assistantMsg.toolCalls.some((tc2: any) => tc2.id === tc.id)
          if (!alreadyAdded) {
            assistantMsg.toolCalls.push({
              id: tc.id,
              name: tc.toolName,
              input: typeof tc.toolInput === 'object' ? JSON.stringify(tc.toolInput, null, 2) : String(tc.toolInput || ''),
              status: tc.status === 'completed' ? 'completed' : tc.status === 'error' ? 'error' : 'pending',
              result: tc.toolOutput ? (typeof tc.toolOutput === 'object' ? JSON.stringify(tc.toolOutput, null, 2) : String(tc.toolOutput)) : undefined,
            })
          }
        })
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
        isStreaming: true,
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
      if (currentAssistantMessageId) {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.isStreaming = false
        }
      }
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
      title: `对话 ${sessions.value.length + 1}`,
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

function handleLogout() {
  clearAuthFromStorage()
  authToken.value = null
  userId.value = null
  userUsername.value = null
  userEmail.value = null
  isLoggedIn.value = false
  sessions.value = []
  messages.value = []
  currentSessionId.value = null
  loginUsername.value = ''
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
    <template v-if="!isLoggedIn">
      <AuthPage @loginSuccess="handleLoginSuccess" />
    </template>

    <template v-else>
      <header class="header">
        <div class="header-left">
          <button class="menu-btn" @click="toggleSidebar">☰</button>
          <h1>Claude Code Web</h1>
        </div>
        <div class="header-right">
          <span class="user-info">{{ userUsername }} ({{ userEmail }})</span>
          <button @click="handleLogout" class="logout-btn">退出</button>
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
              <h2>👋 欢迎, {{ userUsername }}!</h2>
              <p>开始一段新的对话吧</p>
              <div class="tools-list">
                <h3>可用工具:</h3>
                <ul>
                  <li><code>Bash</code> - 执行 Shell 命令</li>
                  <li><code>FileRead</code> - 读取文件</li>
                  <li><code>FileWrite</code> - 写入文件</li>
                  <li><code>Grep</code> - 代码搜索</li>
                  <li><code>Glob</code> - 文件匹配</li>
                </ul>
              </div>
            </div>

            <template v-for="msg in messages" :key="msg.id">
              <ChatMessage :role="msg.role" :content="msg.content" :isStreaming="msg.isStreaming">
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
    </template>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(180deg, #0a0a0f 0%, #12121a 100%);
  color: #e5e7eb;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(20, 20, 30, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-btn {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  font-size: 16px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: rgba(99, 102, 241, 0.25);
  color: #c4b5fd;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  color: #6b7280;
  font-size: 13px;
  padding: 6px 12px;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 20px;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.logout-btn {
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.25);
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
  padding: 8px 16px;
  font-size: 12px;
  text-align: center;
  background: rgba(99, 102, 241, 0.1);
  color: #818cf8;
  border-bottom: 1px solid rgba(99, 102, 241, 0.1);
}

.connection-status.connected {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  border-bottom-color: rgba(34, 197, 94, 0.2);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: transparent;
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.3);
  border-radius: 3px;
}

.welcome {
  text-align: center;
  padding: 48px 20px;
  color: #6b7280;
  max-width: 500px;
  margin: 0 auto;
}

.welcome h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome p {
  font-size: 15px;
  margin-bottom: 32px;
}

.tools-list {
  margin-top: 24px;
  text-align: left;
  max-width: 380px;
  margin-left: auto;
  margin-right: auto;
  background: rgba(30, 30, 45, 0.6);
  padding: 20px;
  border-radius: 16px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  backdrop-filter: blur(8px);
}

.tools-list h3 {
  font-size: 13px;
  font-weight: 600;
  color: #a5b4fc;
  margin-bottom: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tools-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tools-list li {
  padding: 8px 0;
  font-size: 14px;
  color: #9ca3af;
  border-bottom: 1px solid rgba(99, 102, 241, 0.08);
}

.tools-list li:last-child {
  border-bottom: none;
}

.tools-list code {
  background: rgba(99, 102, 241, 0.15);
  padding: 3px 8px;
  border-radius: 6px;
  color: #a5b4fc;
  font-size: 13px;
  font-family: 'SF Mono', Consolas, monospace;
}

.inline-tool {
  background: rgba(30, 30, 45, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  margin: 16px 0;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.inline-tool.executing {
  border-color: #f59e0b;
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.1);
}

.inline-tool.completed {
  border-color: rgba(34, 197, 94, 0.4);
}

.inline-tool.error {
  border-color: rgba(239, 68, 68, 0.4);
}

.inline-tool .tool-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(40, 40, 60, 0.8);
  border-bottom: 1px solid rgba(99, 102, 241, 0.1);
}

.inline-tool.executing .tool-header {
  background: rgba(50, 40, 30, 0.8);
  border-bottom-color: rgba(245, 158, 11, 0.2);
}

.inline-tool .tool-icon {
  font-size: 14px;
  color: #6366f1;
}

.inline-tool.executing .tool-icon {
  color: #f59e0b;
}

.inline-tool .tool-name {
  font-weight: 600;
  font-size: 14px;
  color: #c4b5fd;
}

.inline-tool .tool-status {
  margin-left: auto;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.inline-tool .tool-status.completed {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.inline-tool .tool-status.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.inline-tool .tool-content {
  padding: 14px 16px;
}

.inline-tool .tool-input {
  background: rgba(15, 15, 25, 0.8);
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  overflow-x: auto;
  margin: 0;
  color: #e5e7eb;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.inline-tool .tool-progress {
  margin-top: 12px;
}

.inline-tool .progress-label {
  font-size: 11px;
  color: #6b7280;
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.inline-tool .progress-output {
  background: rgba(10, 10, 20, 0.8);
  padding: 8px;
  border-radius: 6px;
  font-size: 11px;
  overflow-x: auto;
  margin: 0;
  color: #4ade80;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.inline-tool .tool-result {
  margin-top: 12px;
  background: rgba(20, 50, 30, 0.5);
  border-radius: 8px;
  padding: 10px;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.inline-tool .tool-result pre {
  margin: 0;
  color: #86efac;
  font-size: 12px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  color: #6b7280;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  padding: 12px 16px;
  border-radius: 10px;
  margin: 12px 0;
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const messages = ref<Message[]>([])
const isLoading = ref(false)
const currentModel = ref('qwen-plus')
const error = ref('')

async function handleSend(text: string) {
  messages.value.push({ role: 'user', content: text })
  isLoading.value = true
  error.value = ''

  await nextTick()

  const messagesContainer = document.querySelector('.messages')
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentModel.value,
        messages: messages.value.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('event: message')) {
            const dataLine = lines[lines.indexOf(line) + 1]
            if (dataLine && dataLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(dataLine.slice(6))

                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  fullContent += data.delta.text
                  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
                    messages.value[messages.value.length - 1].content = fullContent
                  } else {
                    messages.value.push({ role: 'assistant', content: fullContent })
                  }

                  await nextTick()
                  if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight
                  }
                }

                if (data.type === 'message_stop') {
                  break
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发生未知错误'
    messages.value.push({
      role: 'assistant',
      content: `错误: ${error.value}`,
    })
  } finally {
    isLoading.value = false
  }
}

function clearChat() {
  messages.value = []
  error.value = ''
}
</script>

<template>
  <div class="chat-container">
    <header class="header">
      <h1>Claude Code Haha</h1>
      <div class="model-select">
        <label>模型:</label>
        <select v-model="currentModel">
          <option value="qwen-plus">qwen-plus</option>
          <option value="qwen-turbo">qwen-turbo</option>
          <option value="qwen-max">qwen-max</option>
        </select>
        <button @click="clearChat" class="clear-btn">清除对话</button>
      </div>
    </header>

    <div class="messages">
      <div v-if="messages.length === 0" class="welcome">
        <h2>👋 欢迎使用 Claude Code Haha</h2>
        <p>基于百炼平台 API 的 Claude Code 本地版本</p>
        <p>输入你的问题开始对话吧！</p>
      </div>

      <ChatMessage
        v-for="(msg, index) in messages"
        :key="index"
        :role="msg.role"
        :content="msg.content"
      />

      <div v-if="isLoading" class="loading">
        <span>Claude 正在思考...</span>
      </div>
    </div>

    <ChatInput @send="handleSend" />
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 900px;
  margin: 0 auto;
  background: white;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #2196f3;
  color: white;
}

.header h1 {
  margin: 0;
  font-size: 20px;
}

.model-select {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-select select {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
}

.clear-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #fafafa;
}

.welcome {
  text-align: center;
  color: #666;
  padding: 48px 24px;
}

.welcome h2 {
  margin-bottom: 16px;
  color: #333;
}

.welcome p {
  margin: 8px 0;
}

.loading {
  text-align: center;
  padding: 16px;
  color: #666;
  font-style: italic;
}
</style>
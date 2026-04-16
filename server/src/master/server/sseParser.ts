/**
 * SSE 事件解析器
 * 
 * 正确处理 TCP 粘包问题
 * 
 * 在 Master → Client 的 HTTP 流中，如果网络波动，多个 SSE 事件可能会挤在一个数据包里
 * 需要正确处理 \n\n 分隔符
 */

export interface SSEParsedEvent {
  /** 事件类型 */
  type: string
  /** 事件数据 */
  data: any
  /** 原始数据行 */
  raw?: string
}

/**
 * SSE Parser
 * 用于解析 Server-Sent Events 流
 */
export class SSEParser {
  private buffer: string = ''
  private eventBuffer: Map<string, string> = new Map()

  /**
   * 解析 SSE 数据块
   * @param chunk 新收到的数据块
   * @returns 解析出的事件数组
   */
  parse(chunk: string): SSEParsedEvent[] {
    this.buffer += chunk
    const events: SSEParsedEvent[] = []
    
    // 按 SSE 事件分隔符分割 (\n\n)
    const eventBlocks = this.buffer.split(/\n\n/)
    
    // 最后一个块可能是不完整的，保留到下次处理
    this.buffer = eventBlocks.pop() || ''
    
    for (const block of eventBlocks) {
      const event = this.parseEventBlock(block)
      if (event) {
        events.push(event)
      }
    }
    
    return events
  }

  /**
   * 解析单个事件块
   */
  private parseEventBlock(block: string): SSEParsedEvent | null {
    let type = 'message'  // 默认事件类型
    let data = ''
    
    for (const line of block.split('\n')) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      if (trimmedLine.startsWith('event:')) {
        type = trimmedLine.slice(6).trim()
      } else if (trimmedLine.startsWith('data:')) {
        data += trimmedLine.slice(5).trim() + '\n'
      }
    }
    
    if (!data) return null
    
    // 移除末尾多余的换行符
    data = data.replace(/\n+$/, '')
    
    try {
      const payload = JSON.parse(data)
      return { type, data: payload, raw: block }
    } catch {
      // 如果不是 JSON，直接返回原始数据
      return { type, data, raw: block }
    }
  }

  /**
   * 重置解析器状态
   * 用于重新开始解析新的流
   */
  reset(): void {
    this.buffer = ''
    this.eventBuffer.clear()
  }

  /**
   * 获取当前缓冲区内容
   */
  getBuffer(): string {
    return this.buffer
  }
}

/**
 * 创建 SSE 事件
 */
export function createSSEEvent(type: string, data: any): string {
  const payload = JSON.stringify({ type, data })
  return `data: ${payload}\n\n`
}

/**
 * 创建多个 SSE 事件
 */
export function createSSEMultipleEvents(events: Array<{ type: string; data: any }>): string {
  return events.map(e => createSSEEvent(e.type, e.data)).join('')
}

/**
 * Master 流式转发器
 * 包含 SSE 解析和异步保存
 */
export class StreamForwarder {
  private parser: SSEParser
  private sessionId: string
  private onEvent: (event: SSEParsedEvent) => void
  private onForward: (type: string, data: any) => void

  constructor(
    sessionId: string,
    onEvent: (event: SSEParsedEvent) => void,
    onForward: (type: string, data: any) => void
  ) {
    this.parser = new SSEParser()
    this.sessionId = sessionId
    this.onEvent = onEvent
    this.onForward = onForward
  }

  /**
   * 转发流数据
   */
  async forward(
    workerStream: ReadableStream<Uint8Array>
  ): Promise<void> {
    const reader = workerStream.getReader()
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = new TextDecoder().decode(value)
        
        // 解析 SSE 事件
        const events = this.parser.parse(chunk)
        
        for (const event of events) {
          // 立即转发给客户端
          this.onForward(event.type, event.data)
          
          // 异步持久化（不阻塞）
          this.asyncPersist(event)
          
          // 回调通知
          this.onEvent(event)
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 异步保存事件数据（Fire and Forget）
   */
  private asyncPersist(event: SSEParsedEvent): void {
    // 使用 setImmediate 不阻塞事件循环
    setImmediate(() => {
      try {
        if (event.type === 'tool_result') {
          this.saveToolCallAsync(event.data)
        } else if (event.type === 'message_complete') {
          this.saveMessageAsync(event.data)
        } else if (event.type === 'tool_call') {
          this.saveToolCallAsync(event.data)
        }
      } catch (error) {
        console.error('[StreamForwarder] 异步保存失败:', error)
      }
    })
  }

  /**
   * 异步保存工具调用结果
   */
  private async saveToolCallAsync(toolCallData: any): Promise<void> {
    try {
      const { getSessionManager } = await import('../services/sessionManager')
      const sessionManager = getSessionManager()
      
      if (toolCallData && toolCallData.id) {
        sessionManager.addToolCall(this.sessionId, toolCallData)
      }
    } catch (error) {
      console.error('[StreamForwarder] 异步保存工具调用失败:', error)
    }
  }

  /**
   * 异步保存消息
   */
  private async saveMessageAsync(messageData: any): Promise<void> {
    try {
      const { getSessionManager } = await import('../services/sessionManager')
      const sessionManager = getSessionManager()
      
      if (messageData && messageData.content) {
        sessionManager.addMessage(
          this.sessionId,
          messageData.role || 'assistant',
          messageData.content,
          messageData.toolCalls,
          messageData.id
        )
      }
    } catch (error) {
      console.error('[StreamForwarder] 异步保存消息失败:', error)
    }
  }

  /**
   * 重置解析器
   */
  reset(): void {
    this.parser.reset()
  }
}

/**
 * 使用 pipeThrough 进行透明流式转发
 * 
 * 策略：Master 收到 Chunk 立即转发，不解析内容，不阻塞
 */
export function createTransparentForwardStream(
  sendToClient: (chunk: string) => void
): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    transform(chunk, controller) {
      // 收到一行，立刻转发，不解析内容
      const text = new TextDecoder().decode(chunk)
      sendToClient(text)
      controller.enqueue(chunk)
    }
  })
}

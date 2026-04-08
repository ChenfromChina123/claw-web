/**
 * WebSocket 消息处理辅助函数
 */

/**
 * Bun WebSocket 帧可能是 string / Buffer / Uint8Array / ArrayBuffer
 * 转换为文本字符串
 */
export function websocketPayloadToText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(new Uint8Array(data))
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(data)
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(data)) {
    return (data as Buffer).toString('utf8')
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView
    return new TextDecoder('utf-8').decode(
      new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
    )
  }
  try {
    return String(data)
  } catch {
    return ''
  }
}

/**
 * 创建事件发送函数
 */
export function createEventSender(ws: unknown): (event: string, data: unknown) => void {
  return (event: string, data: unknown) => {
    try {
      const socket = ws as { send?: (data: string) => void; readyState?: number }
      if (socket.send && socket.readyState === 1) {
        const payload = JSON.stringify({ type: 'event', event, data, timestamp: Date.now() })
        socket.send(payload)
      }
    } catch (error) {
      console.error('Failed to send event:', error)
    }
  }
}

/**
 * WebSocket 消息类型定义
 */
export interface WebSocketMessage {
  type: string
  [key: string]: unknown
}

/**
 * 解析 WebSocket 消息
 */
export function parseWebSocketMessage(data: unknown): WebSocketMessage | null {
  try {
    const text = websocketPayloadToText(data)
    return JSON.parse(text) as WebSocketMessage
  } catch {
    return null
  }
}
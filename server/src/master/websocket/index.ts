/**
 * Master WebSocket Module - WebSocket 转发器
 */

// 导出 Worker Forwarder（用于 Master-Worker 通信）
export { WorkerForwarder, workerForwarder } from './workerForwarder'

// 导出 WebSocket 消息路由处理器（用于前端连接）
export { 
  handleWebSocketOpen, 
  handleWebSocketMessage, 
  handleWebSocketClose 
} from './wsMessageRouter'

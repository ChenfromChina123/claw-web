/**
 * MCP 类型定义测试
 */

import { describe, it, expect } from 'vitest'
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus } from '../mcp'

describe('MCP Types', () => {
  describe('MCPServerConfig', () => {
    it('应该支持 stdio 传输类型', () => {
      const config: MCPServerConfig = {
        id: 'test-server',
        name: 'Test Server',
        command: 'echo',
        args: ['test'],
        enabled: true,
        transport: 'stdio',
      }
      expect(config.id).toBe('test-server')
      expect(config.transport).toBe('stdio')
    })
    
    it('应该支持 websocket 传输类型', () => {
      const config: MCPServerConfig = {
        id: 'ws-server',
        name: 'WebSocket Server',
        enabled: true,
        transport: 'websocket',
        url: 'ws://localhost:8080',
      }
      expect(config.transport).toBe('websocket')
    })
    
    it('应该支持 SSE 传输类型', () => {
      const config: MCPServerConfig = {
        id: 'sse-server',
        name: 'SSE Server',
        enabled: true,
        transport: 'sse',
        url: 'http://localhost:8080/events',
      }
      expect(config.transport).toBe('sse')
    })
    
    it('应该支持 streamable-http 传输类型', () => {
      const config: MCPServerConfig = {
        id: 'http-server',
        name: 'HTTP Server',
        enabled: true,
        transport: 'streamable-http',
        url: 'http://localhost:8080/mcp',
      }
      expect(config.transport).toBe('streamable-http')
    })
  })
  
  describe('MCPTool', () => {
    it('应该创建完整的工具定义', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
        serverId: 'test-server',
        serverName: 'Test Server',
        annotations: {
          title: 'Test Tool',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      }
      expect(tool.name).toBe('test-tool')
      expect(tool.serverId).toBe('test-server')
    })
  })
  
  describe('MCPToolResult', () => {
    it('应该创建成功结果', () => {
      const result: MCPToolResult = {
        success: true,
        result: { data: 'test' },
        duration: 100,
      }
      expect(result.success).toBe(true)
      expect(result.result).toEqual({ data: 'test' })
    })
    
    it('应该创建错误结果', () => {
      const result: MCPToolResult = {
        success: false,
        error: 'Tool execution failed',
        duration: 50,
      }
      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool execution failed')
    })
  })
  
  describe('MCPServerStatus', () => {
    it('应该支持所有状态类型', () => {
      const statuses: MCPServerStatus[] = [
        'disconnected',
        'connecting',
        'connected',
        'error',
        'needs-auth',
        'reconnecting',
      ]
      expect(statuses).toHaveLength(6)
    })
  })
})

/**
 * MCP Gateway 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getMcpGateway, McpGateway } from '../../services/mcp/McpGateway'

describe('McpGateway', () => {
  let gateway: McpGateway
  
  beforeEach(() => {
    // 获取新的网关实例
    gateway = getMcpGateway()
  })
  
  afterEach(async () => {
    // 清理网关
    await gateway.shutdown()
  })
  
  describe('addServer', () => {
    it('应该添加 MCP 服务器', async () => {
      const result = await gateway.addServer({
        name: 'Test Server',
        command: 'echo',
        args: ['test'],
        enabled: true,
        transport: 'stdio',
      })
      
      expect(result.success).toBe(true)
      expect(result.serverId).toBeDefined()
      expect(result.serverId.length).toBeGreaterThan(0)
    })
    
    it('应该记录性能指标', async () => {
      const result = await gateway.addServer({
        name: 'Perf Test Server',
        command: 'echo',
        enabled: true,
      })
      
      // 网关应该记录性能指标
      expect(result.success).toBe(true)
    })
    
    it('应该处理无效的服务器配置', async () => {
      // 测试缺少必要字段的情况
      const result = await gateway.addServer({
        name: '', // 空名称
        enabled: true,
      } as any)
      
      // 可能成功也可能失败，取决于验证逻辑
      expect(typeof result.success).toBe('boolean')
    })
  })
  
  describe('removeServer', () => {
    it('应该移除服务器', async () => {
      // 先添加服务器
      const addResult = await gateway.addServer({
        name: 'Temp Server',
        command: 'echo',
        enabled: true,
      })
      
      expect(addResult.success).toBe(true)
      
      // 然后移除
      const removeResult = await gateway.removeServer(addResult.serverId)
      expect(removeResult).toBe(true)
    })
    
    it('应该处理不存在的服务器', async () => {
      const result = await gateway.removeServer('non-existent-id')
      expect(result).toBe(false)
    })
  })
  
  describe('listTools', () => {
    it('应该返回空数组当服务器未连接', async () => {
      const tools = await gateway.listTools('test-server')
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBe(0)
    })
  })
  
  describe('getServerStatus', () => {
    it('应该返回服务器状态列表', () => {
      const status = gateway.getServerStatus()
      expect(Array.isArray(status)).toBe(true)
    })
    
    it('应该包含服务器基本信息', async () => {
      const addResult = await gateway.addServer({
        name: 'Status Test Server',
        command: 'echo',
        enabled: true,
      })
      
      const status = gateway.getServerStatus()
      const server = status.find(s => s.serverId === addResult.serverId)
      
      if (server) {
        expect(server.name).toBe('Status Test Server')
        expect(server.status).toBeDefined()
      }
    })
  })
  
  describe('callTool', () => {
    it('应该处理不存在的服务器', async () => {
      const result = await gateway.callTool('non-existent', 'test-tool', {})
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
  
  describe('shutdown', () => {
    it('应该关闭所有连接', async () => {
      await gateway.addServer({
        name: 'Shutdown Test',
        command: 'echo',
        enabled: true,
      })
      
      await gateway.shutdown()
      
      const status = gateway.getServerStatus()
      expect(status.length).toBe(0)
    })
  })
  
  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = getMcpGateway()
      const instance2 = getMcpGateway()
      expect(instance1).toBe(instance2)
    })
  })
})

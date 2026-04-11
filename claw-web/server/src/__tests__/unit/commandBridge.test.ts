/**
 * WebCommandBridge 测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WebCommandBridge, parseUserInput } from '../../integrations/commandBridge'

describe('WebCommandBridge', () => {
  let bridge: WebCommandBridge
  
  beforeEach(() => {
    bridge = new WebCommandBridge()
  })
  
  describe('execute', () => {
    it('应该执行帮助命令', async () => {
      const result = await bridge.execute('/help', { sessionId: 'test-session' })
      expect(result.success).toBe(true)
      expect(result.output).toContain('可用命令')
    })
    
    it('应该执行 ping 命令', async () => {
      const result = await bridge.execute('/ping', { sessionId: 'test-session' })
      expect(result.success).toBe(true)
      expect(result.output).toBe('pong!')
    })
    
    it('应该执行 clear 命令', async () => {
      const result = await bridge.execute('/clear', { sessionId: 'test-session' })
      expect(result.success).toBe(true)
      expect(result.output).toBe('会话已清除')
    })
    
    it('应该执行 status 命令', async () => {
      const result = await bridge.execute('/status', { sessionId: 'test-session' })
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect((result.data as any).status).toBe('online')
    })
    
    it('应该处理未知命令', async () => {
      const result = await bridge.execute('/unknown-command', { sessionId: 'test-session' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown command')
    })
    
    it('应该记录命令历史', async () => {
      await bridge.execute('/ping', { sessionId: 'test-session-1' })
      await bridge.execute('/ping', { sessionId: 'test-session-1' })
      await bridge.execute('/ping', { sessionId: 'test-session-2' })
      
      const history = bridge.getHistory('test-session-1')
      expect(history.length).toBe(2)
      
      const allHistory = bridge.getHistory()
      expect(allHistory.length).toBe(3)
    })
    
    it('应该限制历史记录大小', async () => {
      // 执行超过最大限制的命令
      for (let i = 0; i < 105; i++) {
        await bridge.execute('/ping', { sessionId: 'test-session' })
      }
      
      const history = bridge.getHistory('test-session')
      expect(history.length).toBeLessThanOrEqual(100)
    })
  })
  
  describe('executeCommand', () => {
    it('应该处理空命令', async () => {
      const result = await bridge.executeCommand('')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Empty command')
    })
    
    it('应该解析带参数的命令', async () => {
      const result = await bridge.executeCommand('/help config')
      expect(result.success).toBe(true)
    })
    
    it('应该支持不带斜杠的命令', async () => {
      const result = await bridge.executeCommand('help')
      expect(result.success).toBe(true)
    })
  })
  
  describe('isCommand', () => {
    it('应该识别带斜杠的命令', () => {
      expect(bridge.isCommand('/help')).toBe(true)
      expect(bridge.isCommand('/ping')).toBe(true)
    })
    
    it('应该识别不带斜杠的命令', () => {
      expect(bridge.isCommand('help')).toBe(true)
      expect(bridge.isCommand('ping')).toBe(true)
    })
    
    it('应该识别非命令', () => {
      expect(bridge.isCommand('hello world')).toBe(false)
      expect(bridge.isCommand('random text')).toBe(false)
    })
  })
  
  describe('getHistory', () => {
    it('应该返回空数组当没有历史', () => {
      const history = bridge.getHistory('non-existent')
      expect(history.length).toBe(0)
    })
    
    it('应该限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        await bridge.execute('/ping', { sessionId: 'test-session' })
      }
      
      const history = bridge.getHistory('test-session', 5)
      expect(history.length).toBe(5)
    })
  })
  
  describe('clearHistory', () => {
    it('应该清除所有历史', async () => {
      await bridge.execute('/ping', { sessionId: 'session-1' })
      await bridge.execute('/ping', { sessionId: 'session-2' })
      
      bridge.clearHistory()
      expect(bridge.getHistory().length).toBe(0)
    })
    
    it('应该只清除指定会话的历史', async () => {
      await bridge.execute('/ping', { sessionId: 'session-1' })
      await bridge.execute('/ping', { sessionId: 'session-2' })
      
      bridge.clearHistory('session-1')
      
      const session1History = bridge.getHistory('session-1')
      const session2History = bridge.getHistory('session-2')
      
      expect(session1History.length).toBe(0)
      expect(session2History.length).toBe(1)
    })
  })
  
  describe('getCommandsList', () => {
    it('应该返回所有命令', () => {
      const commands = bridge.getCommandsList()
      expect(commands.length).toBeGreaterThan(10)
      
      const names = commands.map(c => c.name)
      expect(names).toContain('help')
      expect(names).toContain('clear')
      expect(names).toContain('status')
      expect(names).toContain('ping')
    })
    
    it('应该包含命令类别', () => {
      const commands = bridge.getCommandsList()
      const categories = commands.map(c => c.category)
      
      expect(categories).toContain('general')
      expect(categories).toContain('session')
      expect(categories).toContain('tools')
      expect(categories).toContain('config')
      expect(categories).toContain('advanced')
    })
  })
})

describe('parseUserInput', () => {
  it('应该识别带斜杠的命令', () => {
    const result = parseUserInput('/help')
    expect(result.isCommand).toBe(true)
    expect(result.command).toBe('/help')
  })
  
  it('应该识别不带斜杠的命令', () => {
    const result = parseUserInput('help me')
    expect(result.isCommand).toBe(true)
    expect(result.command).toBe('/help me')
  })
  
  it('应该识别普通消息', () => {
    const result = parseUserInput('hello world')
    expect(result.isCommand).toBe(false)
    expect(result.message).toBe('hello world')
  })
  
  it('应该处理空字符串', () => {
    const result = parseUserInput('')
    expect(result.isCommand).toBe(false)
    expect(result.message).toBe('')
  })
})

/**
 * 错误处理工具函数测试
 */

import { describe, it, expect } from 'vitest'
import { getErrorMessage, createError, safeExecute, formatDuration } from '../error-handling'

describe('error-handling', () => {
  describe('getErrorMessage', () => {
    it('应该从 Error 对象中提取消息', () => {
      const error = new Error('Test message')
      expect(getErrorMessage(error)).toBe('Test message')
    })
    
    it('应该处理字符串错误', () => {
      expect(getErrorMessage('Simple error')).toBe('Simple error')
    })
    
    it('应该处理未知类型的错误', () => {
      expect(getErrorMessage({ code: 500, message: 'Server error' })).toBe('[object Object]')
      expect(getErrorMessage(null)).toBe('Unknown error occurred')
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred')
      expect(getErrorMessage(123)).toBe('Unknown error occurred')
    })
  })
  
  describe('createError', () => {
    it('应该创建带消息的 Error 对象', () => {
      const error = createError('Test error')
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Test error')
    })
    
    it('应该创建带错误码的 Error 对象', () => {
      const error = createError('Not found', 'NOT_FOUND')
      expect(error.message).toBe('Not found')
      expect((error as any).code).toBe('NOT_FOUND')
    })
  })
  
  describe('safeExecute', () => {
    it('应该返回成功结果', async () => {
      const result = await safeExecute(() => Promise.resolve(42))
      expect(result).toEqual({ success: true, data: 42 })
    })
    
    it('应该返回错误结果（Error 对象）', async () => {
      const result = await safeExecute(() => Promise.reject(new Error('Failed')))
      expect(result.success).toBe(false)
      expect((result as any).error.message).toBe('Failed')
    })
    
    it('应该返回错误结果（字符串）', async () => {
      const result = await safeExecute(() => Promise.reject('String error'))
      expect(result.success).toBe(false)
      expect((result as any).error).toBeInstanceOf(Error)
    })
    
    it('应该处理同步函数', async () => {
      const result = await safeExecute(() => {
        throw new Error('Sync error')
      })
      expect(result.success).toBe(false)
      expect((result as any).error.message).toBe('Sync error')
    })
  })
  
  describe('formatDuration', () => {
    it('应该格式化毫秒', () => {
      expect(formatDuration(500)).toBe('500ms')
    })
    
    it('应该格式化秒', () => {
      expect(formatDuration(5000)).toBe('5.00s')
      expect(formatDuration(5500)).toBe('5.50s')
    })
    
    it('应该格式化分钟', () => {
      expect(formatDuration(120000)).toBe('2m 0s')
      expect(formatDuration(125000)).toBe('2m 5s')
    })
    
    it('应该处理零', () => {
      expect(formatDuration(0)).toBe('0ms')
    })
  })
})

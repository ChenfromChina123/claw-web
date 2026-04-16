/**
 * 工具单元测试
 * 
 * 测试工具注册、验证、别名等功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  normalizeToolName,
  isValidToolName,
  getStandardToolName,
  STANDARD_TOOL_NAMES,
  TOOL_ALIASES,
  getRecommendedToolsByCategory,
} from '../../tools/toolAliases'
import {
  validateToolInput,
  validateInputAgainstSchema,
  validateRequiredFields,
  validateEnumValue,
} from '../../tools/toolValidator'

describe('工具别名测试', () => {
  describe('normalizeToolName', () => {
    test('应该返回标准工具名称', () => {
      expect(normalizeToolName('FileRead')).toBe('FileRead')
      expect(normalizeToolName('Bash')).toBe('Bash')
    })
    
    test('应该正确映射别名到标准名称', () => {
      expect(normalizeToolName('Read')).toBe('FileRead')
      expect(normalizeToolName('read')).toBe('FileRead')
      expect(normalizeToolName('Write')).toBe('FileWrite')
      expect(normalizeToolName('Edit')).toBe('FileEdit')
      expect(normalizeToolName('shell')).toBe('Bash')
      expect(normalizeToolName('grep')).toBe('Grep')
    })
    
    test('应该返回 null 表示无效名称', () => {
      expect(normalizeToolName('InvalidTool')).toBe(null)
      expect(normalizeToolName('not_real')).toBe(null)
    })
  })
  
  describe('isValidToolName', () => {
    test('应该正确验证有效工具名称', () => {
      expect(isValidToolName('FileRead')).toBe(true)
      expect(isValidToolName('Read')).toBe(true)
      expect(isValidToolName('Bash')).toBe(true)
    })
    
    test('应该正确拒绝无效工具名称', () => {
      expect(isValidToolName('FakeTool')).toBe(false)
      expect(isValidToolName('')).toBe(false)
    })
  })
  
  describe('getStandardToolName', () => {
    test('应该返回标准名称或原始名称', () => {
      expect(getStandardToolName('Read')).toBe('FileRead')
      expect(getStandardToolName('Bash')).toBe('Bash')
      expect(getStandardToolName('Unknown')).toBe('Unknown')
    })
  })
  
  describe('STANDARD_TOOL_NAMES', () => {
    test('应该包含所有标准工具名称', () => {
      expect(STANDARD_TOOL_NAMES).toContain('FileRead')
      expect(STANDARD_TOOL_NAMES).toContain('FileWrite')
      expect(STANDARD_TOOL_NAMES).toContain('Bash')
      expect(STANDARD_TOOL_NAMES).toContain('Glob')
      expect(STANDARD_TOOL_NAMES).toContain('Grep')
    })
  })
  
  describe('TOOL_ALIASES', () => {
    test('应该定义常见别名映射', () => {
      expect(TOOL_ALIASES['Read']).toBe('FileRead')
      expect(TOOL_ALIASES['shell']).toBe('Bash')
    })
  })
  
  describe('getRecommendedToolsByCategory', () => {
    test('应该返回文件类工具', () => {
      const fileTools = getRecommendedToolsByCategory('file')
      expect(fileTools).toContain('FileRead')
      expect(fileTools).toContain('FileWrite')
    })
    
    test('应该返回 Shell 类工具', () => {
      const shellTools = getRecommendedToolsByCategory('shell')
      expect(shellTools).toContain('Bash')
    })
    
    test('应该为空类别返回空数组', () => {
      const unknownTools = getRecommendedToolsByCategory('unknown')
      expect(unknownTools).toEqual([])
    })
  })
})

describe('工具验证器测试', () => {
  describe('validateInputAgainstSchema', () => {
    test('应该验证必需字段', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      }
      
      const validResult = validateInputAgainstSchema({ name: 'John' }, schema)
      expect(validResult.valid).toBe(true)
      
      const invalidResult = validateInputAgainstSchema({}, schema)
      expect(invalidResult.valid).toBe(false)
      expect(invalidResult.errors).toHaveLength(1)
    })
    
    test('应该验证类型匹配', () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      }
      
      const validResult = validateInputAgainstSchema({ count: 42 }, schema)
      expect(validResult.valid).toBe(true)
      
      const invalidResult = validateInputAgainstSchema({ count: 'not a number' }, schema)
      expect(invalidResult.valid).toBe(false)
    })
    
    test('应该验证字符串长度限制', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 10 },
        },
      }
      
      const tooShortResult = validateInputAgainstSchema({ name: 'ab' }, schema)
      expect(tooShortResult.valid).toBe(false)
      
      const tooLongResult = validateInputAgainstSchema({ name: 'this is too long' }, schema)
      expect(tooLongResult.valid).toBe(false)
      
      const validResult = validateInputAgainstSchema({ name: 'John' }, schema)
      expect(validResult.valid).toBe(true)
    })
    
    test('应该验证枚举值', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'active', 'completed'] },
        },
      }
      
      const validResult = validateInputAgainstSchema({ status: 'active' }, schema)
      expect(validResult.valid).toBe(true)
      
      const invalidResult = validateInputAgainstSchema({ status: 'invalid' }, schema)
      expect(invalidResult.valid).toBe(false)
    })
    
    test('应该验证数字范围', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0, maximum: 150 },
        },
      }
      
      const validResult = validateInputAgainstSchema({ age: 25 }, schema)
      expect(validResult.valid).toBe(true)
      
      const tooLowResult = validateInputAgainstSchema({ age: -5 }, schema)
      expect(tooLowResult.valid).toBe(false)
      
      const tooHighResult = validateInputAgainstSchema({ age: 200 }, schema)
      expect(tooHighResult.valid).toBe(false)
    })
    
    test('应该验证数组项', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      }
      
      const validResult = validateInputAgainstSchema({ items: ['a', 'b', 'c'] }, schema)
      expect(validResult.valid).toBe(true)
      
      const invalidResult = validateInputAgainstSchema({ items: [1, 2, 3] }, schema)
      expect(invalidResult.valid).toBe(false)
    })
  })
  
  describe('validateRequiredFields', () => {
    test('应该验证必需字段', () => {
      const result = validateRequiredFields({ name: 'John' }, ['name', 'email'])
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('email')
    })
    
    test('应该验证空字符串', () => {
      const result = validateRequiredFields({ name: '' }, ['name'])
      expect(result.valid).toBe(false)
      expect(result.errors[0].code).toBe('EMPTY_STRING_NOT_ALLOWED')
    })
  })
  
  describe('validateEnumValue', () => {
    test('应该验证枚举值', () => {
      const result = validateEnumValue('active', 'status', ['pending', 'active', 'completed'])
      expect(result.valid).toBe(true)
      
      const invalidResult = validateEnumValue('invalid', 'status', ['pending', 'active', 'completed'])
      expect(invalidResult.valid).toBe(false)
    })
  })
  
  describe('validateToolInput', () => {
    test('应该验证工具输入', () => {
      const schema = {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      }
      
      const validResult = validateToolInput({ path: '/tmp/test.txt' }, schema)
      expect(validResult.valid).toBe(true)
      
      const invalidResult = validateToolInput({}, schema)
      expect(invalidResult.valid).toBe(false)
    })
  })
})

/**
 * 集成测试文件
 * 测试 WebSocket、API 和工具执行功能
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'

// 测试配置
const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL || 'http://localhost:3000',
  wsUrl: process.env.TEST_WS_URL || 'ws://localhost:3000/ws',
  timeout: 10000,
}

// 模拟 API 响应类型
interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// 简单测试工具函数
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    }
  }
}

describe('API Health Tests', () => {
  test('服务器信息端点应该返回正确的响应', async () => {
    const response = await apiRequest('/api/info')
    expect(response.success).toBe(true)
    expect(response.data).toBeDefined()
    expect(response.data).toHaveProperty('name')
    expect(response.data).toHaveProperty('version')
  })
})

describe('Tools API Tests', () => {
  test('获取工具列表应该成功', async () => {
    const response = await apiRequest('/api/tools')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('tools')
    expect(Array.isArray(response.data?.tools)).toBe(true)
    expect(response.data).toHaveProperty('categories')
  })

  test('获取特定工具应该返回工具详情', async () => {
    const response = await apiRequest('/api/tools/Bash')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('name', 'Bash')
    expect(response.data).toHaveProperty('description')
    expect(response.data).toHaveProperty('inputSchema')
  })

  test('获取不存在的工具应该返回错误', async () => {
    const response = await apiRequest('/api/tools/NonExistentTool')
    expect(response.success).toBe(false)
    expect(response.error).toBeDefined()
    expect(response.error?.code).toBe('TOOL_NOT_FOUND')
  })
})

describe('Models API Tests', () => {
  test('获取模型列表应该成功', async () => {
    const response = await apiRequest('/api/models')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('models')
    expect(Array.isArray(response.data?.models)).toBe(true)
    expect(response.data).toHaveProperty('default')
  })
})

describe('MCP API Tests', () => {
  test('获取 MCP 服务器列表应该成功', async () => {
    const response = await apiRequest('/api/mcp/servers')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('servers')
    expect(response.data).toHaveProperty('count')
  })

  test('获取 MCP 状态应该成功', async () => {
    const response = await apiRequest('/api/mcp/status')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('totalServers')
    expect(response.data).toHaveProperty('enabledServers')
  })

  test('获取 MCP 工具列表应该成功', async () => {
    const response = await apiRequest('/api/mcp/tools')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('tools')
    expect(response.data).toHaveProperty('count')
  })
})

describe('Tool Execution Tests', () => {
  test('执行 FileRead 工具应该成功', async () => {
    const response = await apiRequest('/api/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        toolName: 'FileRead',
        toolInput: {
          path: 'package.json',
        },
      }),
    })
    expect(response.success).toBe(true)
    if (response.success) {
      expect(response.data).toHaveProperty('success')
    }
  })

  test('执行不存在的工具应该返回错误', async () => {
    const response = await apiRequest('/api/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        toolName: 'NonExistentTool',
        toolInput: {},
      }),
    })
    expect(response.success).toBe(false)
  })

  test('验证工具输入应该正确检测缺失参数', async () => {
    const response = await apiRequest('/api/tools/validate', {
      method: 'POST',
      body: JSON.stringify({
        toolName: 'FileRead',
        toolInput: {}, // 缺少必需的 path 参数
      }),
    })
    expect(response.success).toBe(true)
    if (response.success) {
      expect(response.data).toHaveProperty('valid', false)
      expect(response.data).toHaveProperty('errors')
    }
  })
})

describe('Tool History Tests', () => {
  test('获取工具历史应该成功', async () => {
    const response = await apiRequest('/api/tools/history')
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('history')
    expect(response.data).toHaveProperty('count')
  })

  test('清空工具历史应该成功', async () => {
    const response = await apiRequest('/api/tools/history/clear', {
      method: 'POST',
    })
    expect(response.success).toBe(true)
  })
})

describe('Performance Tests', () => {
  test('API 响应时间应该在合理范围内', async () => {
    const startTime = Date.now()
    await apiRequest('/api/info')
    const duration = Date.now() - startTime
    expect(duration).toBeLessThan(1000) // 1秒内响应
  })

  test('并发请求应该都能成功', async () => {
    const promises = [
      apiRequest('/api/info'),
      apiRequest('/api/tools'),
      apiRequest('/api/models'),
      apiRequest('/api/mcp/status'),
    ]
    const results = await Promise.all(promises)
    results.forEach((result) => {
      expect(result.success).toBe(true)
    })
  })
})

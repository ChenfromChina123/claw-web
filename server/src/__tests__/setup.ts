/**
 * Vitest 测试设置文件
 * 
 * 提供全局测试配置和工具函数
 */

// 设置测试超时时间
const TEST_TIMEOUT = 10000

// Mock console.error 来减少测试输出噪音
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // 过滤掉已知的无害警告
    const message = args[0]?.toString?.() || ''
    if (
      message.includes('[ToolRegistry]') ||
      message.includes('[Vitest]') ||
      message.includes('Warning:')
    ) {
      return
    }
    originalConsoleError.apply(console, args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
})

/**
 * 测试工具函数
 */

// 创建模拟工具定义
export function createMockToolDefinition(overrides = {}) {
  return {
    name: 'MockTool',
    description: '测试用工具',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    category: 'test',
    handler: async () => ({ success: true, result: {} }),
    ...overrides,
  }
}

// 创建模拟执行上下文
export function createMockContext(overrides = {}) {
  return {
    userId: 'test-user',
    sessionId: 'test-session',
    projectRoot: '/tmp/test-project',
    ...overrides,
  }
}

// 异步等待工具函数
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 创建临时文件
export async function createTempFile(content: string): Promise<string> {
  const { writeFile, unlink } = await import('fs/promises')
  const { join } = await import('path')
  const os = await import('os')
  
  const tempPath = join(os.tmpdir(), `test-${Date.now()}.txt`)
  await writeFile(tempPath, content, 'utf-8')
  
  return tempPath
}

// 清理临时文件
export async function cleanupTempFile(path: string): Promise<void> {
  try {
    const { unlink } = await import('fs/promises')
    await unlink(path)
  } catch {
    // 忽略清理错误
  }
}

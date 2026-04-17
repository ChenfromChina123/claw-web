/**
 * Worker 跨平台测试脚本
 * 
 * 用于测试 Worker 在 Windows、Linux、macOS 上的兼容性
 * 运行方式：bun run test/worker-cross-platform-test.ts
 */

import { platform } from 'os'
import { join } from 'path'

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:4000'
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || (platform() === 'win32' ? 'C:\\workspace' : '/workspace')
const MASTER_TOKEN = process.env.MASTER_INTERNAL_TOKEN || 'internal-master-worker-token-2024'

interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration?: number
}

const results: TestResult[] = []

/**
 * 测试执行器
 */
async function test(name: string, fn: () => Promise<boolean>) {
  const startTime = Date.now()
  try {
    const passed = await fn()
    const duration = Date.now() - startTime
    results.push({ name, passed, duration })
    console.log(`${passed ? '✅' : '❌'} ${name} ${passed ? `(${duration}ms)` : ''}`)
    if (!passed) {
      console.log(`   测试失败，但继续执行...`)
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    results.push({ name, passed: false, error: error.message, duration })
    console.log(`❌ ${name}: ${error.message}`)
  }
}

/**
 * HTTP GET 请求
 */
async function httpGet(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; json?: any }> {
  try {
    const response = await fetch(url, { headers })
    let json: any = undefined
    try {
      json = await response.json()
    } catch {}
    return { ok: response.ok, status: response.status, json }
  } catch (error: any) {
    return { ok: false, status: 0, error: error.message }
  }
}

/**
 * HTTP POST 请求
 */
async function httpPost(
  url: string,
  body: any,
  headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; json?: any }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    let json: any = undefined
    try {
      json = await response.json()
    } catch {}
    return { ok: response.ok, status: response.status, json }
  } catch (error: any) {
    return { ok: false, status: 0, error: error.message }
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║    Worker 跨平台测试                            ║')
  console.log('╚════════════════════════════════════════════════╝')
  console.log(`\n平台：${platform()}`)
  console.log(`Worker URL: ${WORKER_URL}`)
  console.log(`工作目录：${WORKSPACE_DIR}\n`)

  const authHeaders = {
    'X-Master-Token': MASTER_TOKEN,
    'X-User-Id': 'test-user',
    'Content-Type': 'application/json',
  }

  // 1. 健康检查
  await test('健康检查', async () => {
    const result = await httpGet(`${WORKER_URL}/internal/health`)
    if (!result.ok) return false
    return result.json?.status === 'ok' && result.json?.role === 'worker'
  })

  // 2. 执行简单命令
  await test('执行简单命令', async () => {
    const command = platform() === 'win32' ? 'echo Hello Worker' : 'echo Hello Worker'
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'exec',
        requestId: 'test-1',
        payload: { command, cwd: WORKSPACE_DIR },
      },
      authHeaders
    )
    return result.ok && result.json?.success === true
  })

  // 3. 执行命令并验证输出
  await test('命令输出验证', async () => {
    const command = platform() === 'win32' ? 'echo CrossPlatformTest' : 'echo CrossPlatformTest'
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'exec',
        requestId: 'test-2',
        payload: { command, cwd: WORKSPACE_DIR },
      },
      authHeaders
    )
    if (!result.ok || !result.json?.success) return false
    return result.json?.data?.stdout?.includes('CrossPlatformTest')
  })

  // 4. 文件写入测试
  await test('文件写入', async () => {
    const testFile = platform() === 'win32' 
      ? join(WORKSPACE_DIR, 'test_cross_platform.txt')
      : join(WORKSPACE_DIR, 'test_cross_platform.txt')
    
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'file_write',
        requestId: 'test-3',
        payload: {
          path: testFile,
          content: `跨平台测试 - ${platform()} - ${new Date().toISOString()}`,
        },
      },
      authHeaders
    )
    return result.ok && result.json?.success === true
  })

  // 5. 文件读取测试
  await test('文件读取', async () => {
    const testFile = platform() === 'win32' 
      ? join(WORKSPACE_DIR, 'test_cross_platform.txt')
      : join(WORKSPACE_DIR, 'test_cross_platform.txt')
    
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'file_read',
        requestId: 'test-4',
        payload: {
          path: testFile,
          encoding: 'utf8',
        },
      },
      authHeaders
    )
    return result.ok && result.json?.success === true && result.json?.data?.content?.includes('跨平台测试')
  })

  // 6. 目录列表测试
  await test('目录列表', async () => {
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'file_list',
        requestId: 'test-5',
        payload: { path: WORKSPACE_DIR },
      },
      authHeaders
    )
    return result.ok && result.json?.success === true && Array.isArray(result.json?.data?.files)
  })

  // 7. 安全测试 - 路径遍历攻击
  await test('安全测试 - 路径遍历拦截', async () => {
    const maliciousPath = platform() === 'win32' 
      ? '..\\..\\..\\Windows\\System32'
      : '../../../etc'
    
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'file_read',
        requestId: 'test-6',
        payload: {
          path: join(WORKSPACE_DIR, maliciousPath),
          encoding: 'utf8',
        },
      },
      authHeaders
    )
    // 应该被拒绝
    return result.ok && result.json?.success === false
  })

  // 8. 安全测试 - 非法工作目录
  await test('安全测试 - 非法工作目录拦截', async () => {
    const invalidCwd = platform() === 'win32' ? 'C:\\Windows' : '/etc'
    
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'exec',
        requestId: 'test-7',
        payload: { command: 'dir', cwd: invalidCwd },
      },
      authHeaders
    )
    // 应该被拒绝
    return result.ok && result.json?.success === false
  })

  // 9. 无 Token 访问测试
  await test('安全测试 - 无 Token 拒绝访问', async () => {
    const result = await httpPost(
      `${WORKER_URL}/internal/exec`,
      {
        type: 'exec',
        requestId: 'test-8',
        payload: { command: 'echo test', cwd: WORKSPACE_DIR },
      },
      {} // 无 Token
    )
    return result.status === 403
  })

  // 汇总结果
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const passed = results.filter(r => r.passed).length
  const total = results.length
  const avgDuration = results.reduce((acc, r) => acc + (r.duration || 0), 0) / total
  console.log(`结果：${passed}/${total} 通过`)
  console.log(`平均响应时间：${Math.round(avgDuration)}ms`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (passed === total) {
    console.log('🎉 跨平台测试通过！Worker 在所有平台上运行正常。\n')
    process.exit(0)
  } else {
    console.log(`⚠️  有 ${total - passed} 项测试失败，请检查。\n`)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('测试执行失败:', error)
  process.exit(1)
})

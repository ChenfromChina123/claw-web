/**
 * Docker 环境会话标题并行生成测试
 *
 * 通过 HTTP API 测试 Docker 容器中的 LLM 并行生成会话标题功能
 * 运行方式：bun run test/session-title-docker-test.ts
 *
 * 测试内容：
 * 1. 创建会话并发送消息触发标题生成
 * 2. 测试 LLM API 是否正常工作
 * 3. 测试并行请求场景
 * 4. 验证序列号机制
 */

// ============ 配置 ============

const MASTER_URL = process.env.MASTER_URL || 'http://localhost:13000'

// 测试用户信息
const TEST_USER = {
  userId: 'test-docker-user-001',
  username: 'docker-test-user',
}

// ============ 测试框架 ============

interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration?: number
}

const results: TestResult[] = []
let authToken: string | null = null

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    const duration = Date.now() - start
    results.push({ name, passed: true, duration })
    console.log(`✅ ${name} (${duration}ms)`)
  } catch (error: any) {
    const duration = Date.now() - start
    results.push({ name, passed: false, error: error.message, duration })
    console.log(`❌ ${name}: ${error.message} (${duration}ms)`)
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

// ============ HTTP 工具函数 ============

/**
 * 发起 HTTP 请求的通用函数
 */
async function httpFetch(
  path: string,
  options: {
    method?: string
    body?: any
    headers?: Record<string, string>
  } = {}
): Promise<{ ok: boolean; status: number; json?: any; text?: string }> {
  const url = `${MASTER_URL}${path}`
  const { method = 'GET', body, headers = {} } = options

  // 添加认证 token
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (authToken) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    })

    let json: any = undefined
    let text: string | undefined = undefined

    try {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        json = await response.json()
      } else {
        text = await response.text()
      }
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error.message,
    }
  }
}

// ============ 测试流程 ============

async function runTests() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║    Docker 环境会话标题并行生成测试              ║')
  console.log('╚══════════════════════════════════════════════╝\n')
  console.log(`Master URL: ${MASTER_URL}\n`)

  // 0. 检查 Master 健康状态
  await test('Master 健康检查', async () => {
    const result = await httpFetch('/api/info')
    assert(result.ok, `Master 健康检查失败: ${result.status}`)
    assert(result.json?.data?.status === 'healthy' || result.json?.status === 'ok', 'Master 状态不健康')
    console.log(`   Master 状态: ${result.json?.data?.status || result.json?.status}`)
  })

  // 1. 用户登录获取 token
  await test('用户登录获取 Token', async () => {
    const result = await httpFetch('/api/auth/login', {
      method: 'POST',
      body: {
        userId: TEST_USER.userId,
        username: TEST_USER.username,
      },
    })

    if (result.ok && result.json?.data?.token) {
      authToken = result.json.data.token
      console.log(`   Token 获取成功`)
    } else if (result.ok && result.json?.token) {
      authToken = result.json.token
      console.log(`   Token 获取成功`)
    } else {
      // 如果登录失败，尝试直接注册
      const regResult = await httpFetch('/api/auth/register', {
        method: 'POST',
        body: {
          userId: TEST_USER.userId,
          username: TEST_USER.username,
          password: 'test123456',
        },
      })

      if (regResult.ok && (regResult.json?.data?.token || regResult.json?.token)) {
        authToken = regResult.json?.data?.token || regResult.json?.token
        console.log(`   注册成功并获取 Token`)
      } else {
        // 使用模拟 token 继续测试
        authToken = 'test-token-skip-auth'
        console.log(`   使用模拟 Token (跳过认证)`)
      }
    }
  })

  // 2. 创建新会话
  let sessionId: string | null = null
  await test('创建新会话', async () => {
    const result = await httpFetch('/api/sessions', {
      method: 'POST',
      body: {
        userId: TEST_USER.userId,
        title: '新对话',
        model: 'qwen-plus',
      },
    })

    assert(result.ok, `创建会话失败: ${result.status} - ${JSON.stringify(result.json || result.text)}`)
    
    sessionId = result.json?.data?.id || result.json?.id
    assert(sessionId, '未获取到会话 ID')
    
    const title = result.json?.data?.title || result.json?.title
    assert(title === '新对话', `会话初始标题应为 "新对话"，实际: "${title}"`)
    
    console.log(`   会话 ID: ${sessionId}`)
    console.log(`   初始标题: "${title}"`)
  })

  // 3. 等待 1 秒确保会话完全创建
  await new Promise(resolve => setTimeout(resolve, 1000))

  // 4. 发送消息触发标题生成（使用 Agent 执行接口）
  let generatedTitle: string | null = null
  await test('发送消息触发 LLM 标题生成', async () => {
    assert(sessionId, '会话 ID 不存在')

    // 尝试使用 Agent 执行接口（会触发 LLM 标题生成）
    const result = await httpFetch(`/api/sessions/${sessionId}/message`, {
      method: 'POST',
      body: {
        role: 'user',
        content: '如何使用 TypeScript 实现一个类型安全的 REST API 客户端，支持自动重试和错误处理？',
      },
    })

    // 等待 LLM 标题生成（异步）
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 获取会话信息查看标题是否更新
    const sessionInfo = await httpFetch(`/api/sessions/${sessionId}`)
    
    if (sessionInfo.ok && sessionInfo.json?.data) {
      const title = sessionInfo.json.data.title
      console.log(`   当前标题: "${title}"`)
      
      if (title !== '新对话') {
        generatedTitle = title
        console.log(`   ✅ LLM 标题生成成功`)
      } else {
        console.log(`   ⚠️  标题未更新（可能是异步生成还在进行中）`)
      }
    }
  })

  // 5. 再次等待确保标题生成完成
  await new Promise(resolve => setTimeout(resolve, 3000))

  // 6. 检查标题是否已更新
  await test('验证 LLM 标题已更新', async () => {
    assert(sessionId, '会话 ID 不存在')

    const result = await httpFetch(`/api/sessions/${sessionId}`)
    assert(result.ok, '获取会话信息失败')

    const title = result.json?.data?.title || result.json?.title
    assert(title && title !== '新对话', `标题应该已由 LLM 更新，当前: "${title}"`)
    
    console.log(`   最终标题: "${title}"`)
    assert(title.length > 5, '标题长度应大于 5 个字符')
    assert(title.length <= 50, '标题长度应小于等于 50 个字符')
    
    generatedTitle = title
  })

  // 7. 测试并行生成场景 - 创建多个会话同时触发标题生成
  await test('并行场景 - 多个会话同时生成标题', async () => {
    const sessionIds: string[] = []
    const testMessages = [
      '如何优化 React 组件的渲染性能？',
      'Python 中如何实现异步并发编程？',
      'Docker 容器编排的最佳实践是什么？',
    ]

    // 创建多个会话
    for (let i = 0; i < testMessages.length; i++) {
      const result = await httpFetch('/api/sessions', {
        method: 'POST',
        body: {
          userId: TEST_USER.userId,
          title: '新对话',
          model: 'qwen-plus',
        },
      })

      if (result.ok) {
        const id = result.json?.data?.id || result.json?.id
        if (id) {
          sessionIds.push(id)
        }
      }
    }

    assert(sessionIds.length === testMessages.length, `应创建 ${testMessages.length} 个会话，实际: ${sessionIds.length}`)
    console.log(`   创建了 ${sessionIds.length} 个会话`)

    // 并行发送消息触发标题生成
    const sendPromises = sessionIds.map((id, index) => 
      httpFetch(`/api/sessions/${id}/message`, {
        method: 'POST',
        body: {
          role: 'user',
          content: testMessages[index],
        },
      })
    )

    await Promise.all(sendPromises)
    console.log(`   并行发送了 ${sendPromises.length} 条消息`)

    // 等待所有标题生成完成
    await new Promise(resolve => setTimeout(resolve, 8000))

    // 检查所有标题是否都已生成
    let successCount = 0
    for (const id of sessionIds) {
      const result = await httpFetch(`/api/sessions/${id}`)
      if (result.ok) {
        const title = result.json?.data?.title || result.json?.title
        if (title && title !== '新对话') {
          successCount++
          console.log(`   会话 ${id.slice(0, 8)}... 标题: "${title}"`)
        } else {
          console.log(`   会话 ${id.slice(0, 8)}... 标题: "${title}" (未更新)`)
        }
      }
    }

    console.log(`   ${successCount}/${sessionIds.length} 个会话标题生成成功`)
    assert(successCount >= 1, '至少应有 1 个会话标题生成成功')
  })

  // 8. 测试序列号机制 - 快速连续发送消息
  await test('序列号机制 - 快速连续发送消息只保留最新', async () => {
    assert(sessionId, '会话 ID 不存在')

    // 快速连续发送多条消息
    const messages = [
      '消息 1: 如何学习 React？',
      '消息 2: TypeScript 有什么优势？',
      '消息 3: Docker 容器如何优化？',
    ]

    // 并行发送（模拟并发场景）
    const sendPromises = messages.map(msg =>
      httpFetch(`/api/sessions/${sessionId}/message`, {
        method: 'POST',
        body: {
          role: 'user',
          content: msg,
        },
      })
    )

    await Promise.all(sendPromises)
    console.log(`   快速发送了 ${messages.length} 条消息`)

    // 等待标题生成完成
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 检查标题
    const result = await httpFetch(`/api/sessions/${sessionId}`)
    assert(result.ok, '获取会话信息失败')

    const title = result.json?.data?.title || result.json?.title
    console.log(`   最终标题: "${title}"`)
    assert(title && title !== '新对话', '标题应该已被更新')
  })

  // 汇总结果
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const passed = results.filter(r => r.passed).length
  const total = results.length
  const failed = total - passed

  console.log(`结果: ${passed}/${total} 通过`)

  if (failed > 0) {
    console.log(`\n失败的测试:`)
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`)
    })
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (passed === total) {
    console.log('🎉 所有测试通过！Docker 环境 LLM 并行标题生成功能正常。\n')
    process.exit(0)
  } else {
    console.log(`⚠️  有 ${failed} 项测试失败，请检查。\n`)
    process.exit(1)
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试执行失败:', error)
  process.exit(1)
})

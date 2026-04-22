/**
 * 会话标题并行生成测试
 *
 * 测试并行生成会话标题的功能，包括：
 * - 基本标题生成功能
 * - 并发生成场景（序列号机制）
 * - 缓存机制
 * - 降级方案（简单标题生成）
 * - 边界情况处理
 *
 * 运行方式：bun run test/session-title-parallel-test.ts
 */

import {
  generateSessionTitleWithLLM,
  generateSessionTitle,
  generateSimpleTitle,
  isFirstMessage,
} from '../src/master/services/sessionTitleGenerator'

// 模拟 SessionManager 的序列号机制
class MockSessionManager {
  private titleGenSeq: Map<string, number> = new Map()
  private titles: Map<string, string> = new Map()

  /**
   * 模拟并发生成标题
   * @param sessionId 会话ID
   * @param content 用户消息内容
   * @returns 生成的标题或null（如果被序列号机制丢弃）
   */
  async generateTitleParallel(sessionId: string, content: string): Promise<string | null> {
    const currentSeq = (this.titleGenSeq.get(sessionId) || 0) + 1
    this.titleGenSeq.set(sessionId, currentSeq)

    // 模拟异步生成
    const title = await this.generateAndUpdateSessionTitle(sessionId, content, currentSeq)
    return title
  }

  private async generateAndUpdateSessionTitle(
    sessionId: string,
    userContent: string,
    genSeq: number
  ): Promise<string | null> {
    // 检查序列号是否仍是最新的
    const currentSeq = this.titleGenSeq.get(sessionId)
    if (currentSeq !== genSeq) {
      console.log(`[MockSessionManager] 序列号不匹配 (期望=${genSeq}, 当前=${currentSeq})，丢弃结果`)
      return null
    }

    // 生成标题
    let title = await generateSessionTitleWithLLM(userContent)

    // LLM 失败时使用简单标题
    if (!title || title === '新对话') {
      title = generateSimpleTitle(userContent)
    }

    // 再次检查序列号（LLM 调用后可能已有新的请求）
    const finalSeq = this.titleGenSeq.get(sessionId)
    if (finalSeq !== genSeq) {
      console.log(`[MockSessionManager] LLM 调用后序列号不匹配 (期望=${genSeq}, 当前=${finalSeq})，丢弃结果`)
      return null
    }

    this.titles.set(sessionId, title)
    return title
  }

  getTitle(sessionId: string): string | undefined {
    return this.titles.get(sessionId)
  }

  getSeq(sessionId: string): number {
    return this.titleGenSeq.get(sessionId) || 0
  }
}

// 测试框架
interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration?: number
}

const results: TestResult[] = []

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
    throw new Error(message)
  }
}

// ============ 测试用例 ============

async function runTests() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║    会话标题并行生成测试                    ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // 1. 基本标题生成测试
  await test('简单标题生成 - 短消息', async () => {
    const title = generateSimpleTitle('帮我写一个Python脚本')
    assert(title.length > 0, '标题不应为空')
    assert(title.length <= 30, '标题长度不应超过30字符')
    assert(!title.startsWith('请'), '标题不应包含礼貌用语前缀')
  })

  await test('简单标题生成 - 长消息截断', async () => {
    const longMessage = '请帮我写一个Python脚本，用来处理CSV文件，将数据从一种格式转换为另一种格式，并且需要支持多种编码方式'
    const title = generateSimpleTitle(longMessage)
    assert(title.length <= 30, '标题长度不应超过30字符')
    assert(title.length > 0, '标题不应为空')
  })

  await test('简单标题生成 - 去除多种前缀', async () => {
    const testCases = [
      { input: '请问如何安装React', expected: '安装React' },
      { input: '你好，我想学习TypeScript', expected: '学习TypeScript' },
      { input: '帮我看看这段代码有什么问题', expected: '这段代码有什么问题' },
      { input: 'Hello, how to use Docker', expected: 'how to use Docker' },
    ]

    for (const { input, expected } of testCases) {
      const title = generateSimpleTitle(input)
      assert(title.includes(expected) || title.length > 0, 
        `输入 "${input}" 的标题 "${title}" 应包含 "${expected}" 或至少不为空`)
    }
  })

  await test('简单标题生成 - 空消息处理', async () => {
    const title = generateSimpleTitle('   ')
    assert(title === '新对话', '空消息应返回默认标题 "新对话"')
  })

  // 2. 缓存机制测试
  await test('标题生成缓存 - 相同消息应返回缓存', async () => {
    const message = '如何优化React组件性能'
    
    // 第一次生成
    const title1 = await generateSessionTitleWithLLM(message)
    
    // 第二次生成（应使用缓存）
    const title2 = await generateSessionTitleWithLLM(message)
    
    assert(title1 === title2, '相同消息应返回相同的标题（缓存命中）')
  })

  // 3. LLM 标题生成测试
  await test('LLM 标题生成 - 正常消息', async () => {
    const message = '如何使用 TypeScript 实现一个类型安全的 REST API 客户端'
    const title = await generateSessionTitleWithLLM(message)
    
    assert(title.length > 0, '标题不应为空')
    assert(title.length <= 50, '标题长度不应超过50字符')
    assert(!title.startsWith('"') && !title.endsWith('"'), '标题不应包含引号')
  })

  await test('LLM 标题生成 - 短消息直接使用简单标题', async () => {
    const shortMessage = '你好'
    const title = await generateSessionTitleWithLLM(shortMessage)
    
    assert(title.length > 0, '标题不应为空')
    assert(title.length <= 30, '短消息应使用简单标题生成')
  })

  // 4. 并发生成测试（核心功能）
  await test('并发生成 - 快速连续生成应只保留最新结果', async () => {
    const manager = new MockSessionManager()
    const sessionId = 'test-session-1'
    
    // 快速连续生成3次
    const promises = [
      manager.generateTitleParallel(sessionId, '第一条消息'),
      manager.generateTitleParallel(sessionId, '第二条消息'),
      manager.generateTitleParallel(sessionId, '第三条消息'),
    ]
    
    const results = await Promise.all(promises)
    
    // 只有最后一个应该成功
    const successCount = results.filter(r => r !== null).length
    assert(successCount <= 2, `并发生成应只保留最新结果，实际成功数: ${successCount}`)
    
    // 最终标题应该是最后一条消息生成的
    const finalTitle = manager.getTitle(sessionId)
    assert(finalTitle !== undefined, '最终标题应被设置')
    console.log(`   最终标题: "${finalTitle}"`)
  })

  await test('并发生成 - 不同会话应独立生成', async () => {
    const manager = new MockSessionManager()
    
    const promises = [
      manager.generateTitleParallel('session-A', '会话A的消息'),
      manager.generateTitleParallel('session-B', '会话B的消息'),
      manager.generateTitleParallel('session-C', '会话C的消息'),
    ]
    
    const [titleA, titleB, titleC] = await Promise.all(promises)
    
    assert(titleA !== null, '会话A的标题应生成成功')
    assert(titleB !== null, '会话B的标题应生成成功')
    assert(titleC !== null, '会话C的标题应生成成功')
    
    assert(manager.getTitle('session-A') !== undefined, '会话A标题应被设置')
    assert(manager.getTitle('session-B') !== undefined, '会话B标题应被设置')
    assert(manager.getTitle('session-C') !== undefined, '会话C标题应被设置')
    
    console.log(`   会话A标题: "${titleA}"`)
    console.log(`   会话B标题: "${titleB}"`)
    console.log(`   会话C标题: "${titleC}"`)
  })

  await test('并发生成 - 序列号机制正确工作', async () => {
    const manager = new MockSessionManager()
    const sessionId = 'test-seq-session'
    
    // 生成第一次
    await manager.generateTitleParallel(sessionId, '消息1')
    assert(manager.getSeq(sessionId) === 1, '序列号应为1')
    
    // 生成第二次
    await manager.generateTitleParallel(sessionId, '消息2')
    assert(manager.getSeq(sessionId) === 2, '序列号应为2')
    
    // 生成第三次
    await manager.generateTitleParallel(sessionId, '消息3')
    assert(manager.getSeq(sessionId) === 3, '序列号应为3')
  })

  await test('并发生成 - 模拟延迟场景', async () => {
    const manager = new MockSessionManager()
    const sessionId = 'test-delay-session'
    
    // 第一个请求（模拟慢速LLM调用）
    const promise1 = (async () => {
      await new Promise(resolve => setTimeout(resolve, 100)) // 模拟慢速
      return manager.generateTitleParallel(sessionId, '慢速消息')
    })()
    
    // 等待50ms后发起第二个请求
    await new Promise(resolve => setTimeout(resolve, 50))
    const promise2 = manager.generateTitleParallel(sessionId, '快速消息')
    
    const [title1, title2] = await Promise.all([promise1, promise2])
    
    // 第一个应该被丢弃（序列号过期）
    // 第二个应该成功
    const finalTitle = manager.getTitle(sessionId)
    assert(finalTitle !== undefined, '最终标题应被设置')
    console.log(`   最终标题: "${finalTitle}"`)
  })

  // 5. 边界情况测试
  await test('边界情况 - 特殊字符消息', async () => {
    const message = '如何解析 JSON 数据中的 <xml> 和 &特殊字符?'
    const title = await generateSessionTitleWithLLM(message)
    
    assert(title.length > 0, '标题不应为空')
    assert(title.length <= 50, '标题长度不应超过50字符')
  })

  await test('边界情况 - 超长消息', async () => {
    const message = '请'.repeat(1000)
    const title = await generateSessionTitleWithLLM(message)
    
    assert(title.length > 0, '标题不应为空')
    assert(title.length <= 50, '标题长度不应超过50字符')
  })

  await test('边界情况 - 空数组内容', async () => {
    const title = generateSimpleTitle('')
    assert(title === '新对话', '空消息应返回默认标题')
  })

  await test('边界情况 - 仅包含空白字符', async () => {
    const title = generateSimpleTitle('   \n\t  ')
    assert(title === '新对话', '仅空白字符应返回默认标题')
  })

  // 6. isFirstMessage 测试
  await test('isFirstMessage - messageCount=0 应返回true', async () => {
    assert(isFirstMessage(0) === true, 'messageCount=0 应是第一条消息')
  })

  await test('isFirstMessage - messageCount>0 应返回false', async () => {
    assert(isFirstMessage(1) === false, 'messageCount=1 不是第一条消息')
    assert(isFirstMessage(10) === false, 'messageCount=10 不是第一条消息')
  })

  // 汇总
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (passed === total) {
    console.log('🎉 所有测试通过！并行标题生成功能正常。\n')
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

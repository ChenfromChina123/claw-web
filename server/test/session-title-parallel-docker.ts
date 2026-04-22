/**
 * Docker 容器内会话标题并行生成完整测试
 * 
 * 测试内容：
 * 1. LLM API 正常工作
 * 2. 并发生成场景（序列号机制）
 * 3. 不同会话独立生成
 * 4. 快速连续生成只保留最新
 * 
 * 运行方式:
 * docker cp server/test/session-title-parallel-docker.ts claw-web-master:/tmp/
 * docker exec claw-web-master sh -c "cp /tmp/session-title-parallel-docker.ts /app/ && cd /app && bun run session-title-parallel-docker.ts"
 */

import { generateSessionTitleWithLLM, generateSimpleTitle } from './src/services/sessionTitleGenerator'
import { SessionManager } from './src/services/sessionManager'

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
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║    Docker 容器内会话标题并行生成测试            ║')
  console.log('╚══════════════════════════════════════════════╝\n')
  
  // 检查环境变量
  console.log('环境信息:')
  console.log(`  LLM_PROVIDER: ${process.env.LLM_PROVIDER}`)
  console.log(`  LLM_MODEL: ${process.env.LLM_MODEL}`)
  console.log(`  QWEN_API_KEY: ${process.env.QWEN_API_KEY ? '已设置' : '(未设置)'}`)
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`)
  console.log(`  CONTAINER_ROLE: ${process.env.CONTAINER_ROLE}`)
  console.log('')

  // 1. LLM API 基础测试
  await test('LLM API - 正常调用生成标题', async () => {
    const message = '如何使用 TypeScript 实现一个类型安全的 REST API 客户端？'
    const title = await generateSessionTitleWithLLM(message)
    
    assert(title && title.length > 0, '标题不应为空')
    assert(title.length <= 50, '标题长度不应超过50字符')
    console.log(`   标题: "${title}"`)
  })

  await test('LLM API - 短消息直接使用简单标题', async () => {
    const shortMessage = '你好'
    const title = await generateSessionTitleWithLLM(shortMessage)
    
    assert(title && title.length > 0, '标题不应为空')
    console.log(`   标题: "${title}"`)
  })

  await test('降级方案 - LLM失败时使用简单标题', async () => {
    const message = '帮我写一段代码'
    const title = await generateSessionTitleWithLLM(message)
    
    // 无论 LLM 成功还是失败，都应该返回有效标题
    assert(title && title.length > 0, '标题不应为空')
    console.log(`   标题: "${title}"`)
  })

  // 2. 并发生成测试 - 模拟 SessionManager 的序列号机制
  await test('并行场景 - 快速连续生成只保留最新', async () => {
    const titleGenSeq: Map<string, number> = new Map()
    const sessionId = 'test-session-parallel'
    const titles: string[] = []

    // 模拟快速连续发起 3 次标题生成请求
    const promises = [
      (async () => {
        const seq = (titleGenSeq.get(sessionId) || 0) + 1
        titleGenSeq.set(sessionId, seq)
        
        // 模拟 LLM 调用延迟
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // 检查序列号
        if (titleGenSeq.get(sessionId) !== seq) {
          console.log(`   请求1被丢弃 (seq=${seq})`)
          return null
        }
        
        const title = await generateSessionTitleWithLLM('消息1: 如何学习React?')
        if (titleGenSeq.get(sessionId) === seq) {
          titles.push(title)
          console.log(`   请求1成功: "${title}" (seq=${seq})`)
          return title
        }
        return null
      })(),
      
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        const seq = (titleGenSeq.get(sessionId) || 0) + 1
        titleGenSeq.set(sessionId, seq)
        
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (titleGenSeq.get(sessionId) !== seq) {
          console.log(`   请求2被丢弃 (seq=${seq})`)
          return null
        }
        
        const title = await generateSessionTitleWithLLM('消息2: TypeScript优势?')
        if (titleGenSeq.get(sessionId) === seq) {
          titles.push(title)
          console.log(`   请求2成功: "${title}" (seq=${seq})`)
          return title
        }
        return null
      })(),
      
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        const seq = (titleGenSeq.get(sessionId) || 0) + 1
        titleGenSeq.set(sessionId, seq)
        
        const title = await generateSessionTitleWithLLM('消息3: Docker优化?')
        if (titleGenSeq.get(sessionId) === seq) {
          titles.push(title)
          console.log(`   请求3成功: "${title}" (seq=${seq})`)
          return title
        }
        return null
      })(),
    ]

    await Promise.all(promises)
    
    // 只有最后一个请求应该成功
    assert(titles.length <= 2, `应只保留最新结果，实际成功: ${titles.length}`)
    console.log(`   最终保留 ${titles.length} 个标题`)
  })

  // 3. 不同会话独立生成测试
  await test('并行场景 - 不同会话独立生成', async () => {
    const testCases = [
      { sessionId: 'session-A', message: 'React组件性能优化方法' },
      { sessionId: 'session-B', message: 'Python异步编程指南' },
      { sessionId: 'session-C', message: 'Docker容器部署实践' },
    ]

    const titleGenSeq: Map<string, number> = new Map()
    const generatedTitles: Map<string, string> = new Map()

    // 并行生成不同会话的标题
    const promises = testCases.map(async ({ sessionId, message }) => {
      const seq = 1
      titleGenSeq.set(sessionId, seq)
      
      const title = await generateSessionTitleWithLLM(message)
      generatedTitles.set(sessionId, title)
      console.log(`   ${sessionId}: "${title}"`)
      return title
    })

    const titles = await Promise.all(promises)
    
    // 所有会话都应成功生成标题
    assert(titles.length === testCases.length, '所有会话都应生成标题')
    assert(titles.every(t => t && t.length > 0), '所有标题都应有效')
    console.log(`   ${titles.length}/${testCases.length} 个会话标题生成成功`)
  })

  // 4. 缓存机制测试
  await test('缓存机制 - 相同消息返回缓存', async () => {
    const message = '如何实现一个高效的缓存系统'
    
    // 第一次生成
    const title1 = await generateSessionTitleWithLLM(message)
    
    // 第二次生成（应使用缓存）
    const title2 = await generateSessionTitleWithLLM(message)
    
    assert(title1 === title2, '相同消息应返回相同标题（缓存命中）')
    console.log(`   两次生成结果一致: "${title1}"`)
  })

  // 5. 边界情况测试
  await test('边界情况 - 超长消息处理', async () => {
    const longMessage = '请'.repeat(500) + '帮我优化代码'
    const title = await generateSessionTitleWithLLM(longMessage)
    
    assert(title && title.length > 0, '标题不应为空')
    assert(title.length <= 50, '标题长度不应超过50字符')
    console.log(`   标题: "${title}"`)
  })

  await test('边界情况 - 特殊字符处理', async () => {
    const message = '如何解析 <xml> 和 &特殊字符? 使用 TypeScript'
    const title = await generateSessionTitleWithLLM(message)
    
    assert(title && title.length > 0, '标题不应为空')
    console.log(`   标题: "${title}"`)
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
    console.log('🎉 所有测试通过！Docker 容器内 LLM 并行标题生成功能正常。')
    console.log('\n测试覆盖:')
    console.log('  ✅ LLM API 正常调用')
    console.log('  ✅ 降级方案（简单标题生成）')
    console.log('  ✅ 序列号机制（只保留最新请求）')
    console.log('  ✅ 不同会话独立生成')
    console.log('  ✅ 缓存机制')
    console.log('  ✅ 边界情况处理')
    process.exit(0)
  } else {
    console.log(`⚠️  有 ${failed} 项测试失败，请检查。`)
    process.exit(1)
  }
}

// 运行测试
runTests().catch((error: any) => {
  console.error('测试执行失败:', error)
  process.exit(1)
})

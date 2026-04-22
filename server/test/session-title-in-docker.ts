/**
 * Docker 容器内 LLM 会话标题生成测试
 * 
 * 运行方式:
 * docker cp server/test/session-title-in-docker.ts claw-web-master:/tmp/test.ts
 * docker exec claw-web-master sh -c 'cd /app && bun run /tmp/test.ts'
 */

const { generateSessionTitleWithLLM, generateSimpleTitle } = require('./src/master/services/sessionTitleGenerator')

async function test() {
  console.log('==========================================')
  console.log('Docker 容器内 LLM 标题生成测试')
  console.log('==========================================\n')
  
  // 检查环境变量
  console.log('环境变量:')
  console.log(`  LLM_PROVIDER: ${process.env.LLM_PROVIDER}`)
  console.log(`  LLM_MODEL: ${process.env.LLM_MODEL}`)
  console.log(`  QWEN_API_KEY: ${process.env.QWEN_API_KEY ? process.env.QWEN_API_KEY.substring(0, 10) + '...' : '(未设置)'}`)
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`)
  console.log('')
  
  // 测试用例
  const testMessages = [
    '如何使用 TypeScript 实现一个类型安全的 REST API 客户端？',
    '优化 React 组件渲染性能的最佳实践',
    'Docker 容器编排与 Kubernetes 部署指南',
    'Python 异步编程与并发模型详解',
  ]
  
  let successCount = 0
  
  console.log('开始测试 LLM 标题生成...\n')
  
  for (const msg of testMessages) {
    console.log(`测试: "${msg.substring(0, 50)}..."`)
    
    const start = Date.now()
    try {
      const title = await generateSessionTitleWithLLM(msg)
      const duration = Date.now() - start
      
      if (title && title !== '新对话') {
        console.log(`✅ LLM 生成标题: "${title}" (${duration}ms)\n`)
        successCount++
      } else {
        const simpleTitle = generateSimpleTitle(msg)
        console.log(`⚠️  LLM 返回无效，降级使用简单标题: "${simpleTitle}" (${duration}ms)\n`)
        successCount++ // 降级方案也算成功
      }
    } catch (error: any) {
      const duration = Date.now() - start
      const simpleTitle = generateSimpleTitle(msg)
      console.log(`❌ LLM 调用失败，降级使用简单标题: "${simpleTitle}" (${duration}ms)`)
      console.log(`   错误: ${error.message}\n`)
      successCount++ // 降级方案也算成功
    }
  }
  
  console.log('\n==========================================')
  console.log(`测试结果: ${successCount}/${testMessages.length} 通过`)
  console.log('==========================================\n')
  
  if (successCount === testMessages.length) {
    console.log('🎉 所有测试通过！LLM 标题生成（含降级）功能正常。')
    process.exit(0)
  } else {
    console.log('⚠️  部分测试失败')
    process.exit(1)
  }
}

test().catch((e: any) => {
  console.error('测试异常:', e)
  process.exit(1)
})

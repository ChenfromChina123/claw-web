/**
 * Docker 容器内 LLM 会话标题生成测试（简化版）
 * 
 * 直接在容器内测试 LLM API 是否正常
 * 运行: cd /app && bun run /tmp/test-llm-direct.ts
 */

import { llmService } from './src/services/llmService'

async function test() {
  console.log('==========================================')
  console.log('Docker 容器内 LLM API 直接测试')
  console.log('==========================================\n')
  
  // 检查环境变量
  console.log('环境变量:')
  console.log(`  LLM_PROVIDER: ${process.env.LLM_PROVIDER}`)
  console.log(`  LLM_MODEL: ${process.env.LLM_MODEL}`)
  console.log(`  QWEN_API_KEY: ${process.env.QWEN_API_KEY ? '已设置 (' + process.env.QWEN_API_KEY.substring(0, 10) + '...)' : '(未设置)'}`)
  console.log(`  ANTHROPIC_AUTH_TOKEN: ${process.env.ANTHROPIC_AUTH_TOKEN ? '已设置' : '(未设置)'}`)
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`)
  console.log(`  CONTAINER_ROLE: ${process.env.CONTAINER_ROLE}`)
  console.log('')
  
  // 测试消息
  const testMessages = [
    {
      input: '如何使用 TypeScript 实现 REST API 客户端？',
      expected: '应包含 TypeScript 和 API 相关关键词',
    },
    {
      input: '优化 React 组件渲染性能的最佳实践',
      expected: '应包含 React 和性能优化相关关键词',
    },
    {
      input: 'Docker 容器编排部署指南',
      expected: '应包含 Docker 相关关键词',
    },
  ]
  
  let successCount = 0
  
  console.log('开始测试 LLM 标题生成...\n')
  
  for (const { input, expected } of testMessages) {
    console.log(`输入: "${input}"`)
    console.log(`期望: ${expected}`)
    
    const start = Date.now()
    try {
      // 直接使用 llmService 生成标题
      const systemPrompt = `你是一个会话标题生成专家。请基于用户的第一条消息生成一个简洁、准确的会话标题。
规则：
1. 标题长度控制在 15-30 个字符之间
2. 去除常见的礼貌用语
3. 保留核心意图和关键词
4. 不要包含引号
5. 直接返回标题，不要解释`

      const response = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请为以下用户消息生成一个简洁的会话标题（15-30字符）：\n\n${input}` },
        ],
        {
          maxTokens: 50,
          temperature: 0.3,
        }
      )
      
      const duration = Date.now() - start
      const title = response.content.trim().replace(/^["']|["']$/g, '')
      
      if (title && title.length > 0 && title.length <= 50) {
        console.log(`✅ LLM 生成标题: "${title}" (${duration}ms)\n`)
        successCount++
      } else {
        console.log(`⚠️  LLM 返回无效标题: "${title}" (${duration}ms)\n`)
      }
    } catch (error: any) {
      const duration = Date.now() - start
      console.log(`❌ LLM 调用失败 (${duration}ms)`)
      console.log(`   错误: ${error.message}\n`)
    }
  }
  
  console.log('\n==========================================')
  console.log(`测试结果: ${successCount}/${testMessages.length} LLM 调用成功`)
  console.log('==========================================\n')
  
  if (successCount === testMessages.length) {
    console.log('🎉 所有 LLM 调用成功！')
    process.exit(0)
  } else if (successCount > 0) {
    console.log('⚠️  部分 LLM 调用成功')
    process.exit(0)
  } else {
    console.log('❌ LLM 调用全部失败')
    process.exit(1)
  }
}

test().catch((e: any) => {
  console.error('测试异常:', e)
  process.exit(1)
})

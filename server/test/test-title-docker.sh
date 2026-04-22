#!/bin/bash
# Docker 容器内测试 LLM 会话标题生成
# 运行方式: docker exec claw-web-master sh /tmp/test-title.sh

echo "=========================================="
echo "Docker 容器内 LLM 标题生成测试"
echo "=========================================="
echo ""

# 检查环境变量
echo "1. 检查 LLM 环境变量..."
echo "   LLM_PROVIDER=$LLM_PROVIDER"
echo "   LLM_MODEL=$LLM_MODEL"
echo "   QWEN_API_KEY=${QWEN_API_KEY:0:10}..."
echo "   NODE_ENV=$NODE_ENV"
echo ""

# 直接使用 bun 运行测试脚本
echo "2. 运行测试脚本..."
cd /app
bun run <<'EOF'
const { generateSessionTitleWithLLM, generateSimpleTitle } = require('./src/master/services/sessionTitleGenerator')

async function test() {
  console.log('开始测试 LLM 标题生成...\n')
  
  // 测试用例
  const testMessages = [
    '如何使用 TypeScript 实现一个类型安全的 REST API 客户端？',
    '优化 React 组件渲染性能的最佳实践',
    'Docker 容器编排与 Kubernetes 部署指南',
    'Python 异步编程与并发模型详解',
  ]
  
  let successCount = 0
  
  for (const msg of testMessages) {
    console.log(`输入: "${msg.substring(0, 40)}..."`)
    
    const start = Date.now()
    try {
      const title = await generateSessionTitleWithLLM(msg)
      const duration = Date.now() - start
      
      if (title && title !== '新对话') {
        console.log(`✅ LLM 标题: "${title}" (${duration}ms)`)
        successCount++
      } else {
        const simpleTitle = generateSimpleTitle(msg)
        console.log(`⚠️  LLM 返回无效，使用简单标题: "${simpleTitle}" (${duration}ms)`)
      }
    } catch (error) {
      const duration = Date.now() - start
      const simpleTitle = generateSimpleTitle(msg)
      console.log(`❌ LLM 调用失败，使用简单标题: "${simpleTitle}" (${duration}ms)`)
      console.log(`   错误: ${error.message}`)
    }
    console.log('')
  }
  
  console.log(`\n测试结果: ${successCount}/${testMessages.length} 个 LLM 标题生成成功`)
  
  if (successCount === testMessages.length) {
    console.log('🎉 所有 LLM 标题生成成功！')
    process.exit(0)
  } else if (successCount > 0) {
    console.log('⚠️  部分 LLM 标题生成成功')
    process.exit(0)
  } else {
    console.log('❌ LLM 标题生成全部失败')
    process.exit(1)
  }
}

test().catch(e => {
  console.error('测试异常:', e)
  process.exit(1)
})
EOF

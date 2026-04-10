/**
 * 规则注入器测试
 */

import { ruleInjector } from '../services/ruleInjector'
import { buildCompleteSystemPrompt } from '../prompts/contextBuilder'

/**
 * 测试规则加载功能
 */
async function testRuleLoading() {
  console.log('\n=== 测试规则加载功能 ===')
  
  const result = await ruleInjector.loadRules(process.cwd())
  
  console.log('用户规则数量:', result.userRules.length)
  console.log('项目规则数量:', result.projectRules.length)
  console.log('总规则数量:', result.totalRules)
  
  if (result.errors.length > 0) {
    console.error('加载错误:', result.errors)
  }
  
  result.userRules.forEach(rule => {
    console.log(`  - 用户规则：${rule.name} (${rule.filePath})`)
  })
  
  result.projectRules.forEach(rule => {
    console.log(`  - 项目规则：${rule.name} (${rule.filePath})`)
  })
}

/**
 * 测试规则注入功能
 */
async function testRuleInjection() {
  console.log('\n=== 测试规则注入功能 ===')
  
  const rulesInjection = await ruleInjector.buildRulesInjection(process.cwd())
  
  if (rulesInjection) {
    console.log('规则注入内容长度:', rulesInjection.length)
    console.log('规则注入内容预览:')
    console.log(rulesInjection.slice(0, 500) + '...')
  } else {
    console.log('没有规则注入')
  }
}

/**
 * 测试完整系统提示构建（包含规则注入）
 */
async function testCompleteSystemPrompt() {
  console.log('\n=== 测试完整系统提示构建 ===')
  
  const systemPrompt = await buildCompleteSystemPrompt({
    cwd: process.cwd(),
    modelId: 'qwen-plus',
    injectRules: true,
  })
  
  console.log('系统提示部分数量:', systemPrompt.length)
  
  // 查找包含规则的部分
  const ruleSectionIndex = systemPrompt.findIndex(s => 
    s.includes('# 规则与约束') || s.includes('Rules and Constraints')
  )
  
  if (ruleSectionIndex !== -1) {
    console.log(`✓ 规则注入成功，位于第 ${ruleSectionIndex} 个部分`)
    console.log('规则部分预览:')
    console.log(systemPrompt[ruleSectionIndex].slice(0, 300) + '...')
  } else {
    console.log('✗ 未找到规则注入部分')
  }
}

/**
 * 测试规则缓存功能
 */
async function testRuleCache() {
  console.log('\n=== 测试规则缓存功能 ===')
  
  // 第一次加载
  const start1 = Date.now()
  await ruleInjector.loadRules(process.cwd())
  const time1 = Date.now() - start1
  
  console.log('第一次加载时间:', time1, 'ms')
  
  // 第二次加载（应该使用缓存）
  const start2 = Date.now()
  await ruleInjector.loadRules(process.cwd())
  const time2 = Date.now() - start2
  
  console.log('第二次加载时间:', time2, 'ms')
  
  if (time2 < time1) {
    console.log('✓ 缓存生效')
  }
  
  // 清除缓存
  ruleInjector.clearCache()
  console.log('缓存已清除')
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  try {
    await testRuleLoading()
    await testRuleInjection()
    await testCompleteSystemPrompt()
    await testRuleCache()
    
    console.log('\n=== 所有测试完成 ===')
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 运行测试
runAllTests()

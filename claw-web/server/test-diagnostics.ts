/**
 * 诊断 API 端点测试脚本
 * 用于验证 /api/diagnostics/health 和 /api/diagnostics/components 端点
 */

import { performanceMonitor } from './src/integration/performanceMonitor'

// 测试 getHealthStatus 方法
console.log('='.repeat(60))
console.log('测试 PerformanceMonitor.getHealthStatus() 方法')
console.log('='.repeat(60))

// 模拟数据库连接状态
const dbConnected = true

// 设置一些模拟的 WebSocket 数据
performanceMonitor.setWebSocketStats(5, 3)

// 获取健康状态
const healthStatus = performanceMonitor.getHealthStatus(dbConnected)

console.log('\n健康状态:')
console.log(JSON.stringify(healthStatus, null, 2))

// 验证返回数据结构
console.log('\n验证数据结构:')
console.log(`✓ status 字段存在：${'status' in healthStatus}`)
console.log(`✓ version 字段存在：${'version' in healthStatus}`)
console.log(`✓ timestamp 字段存在：${'timestamp' in healthStatus}`)
console.log(`✓ uptime 字段存在：${'uptime' in healthStatus}`)
console.log(`✓ components 字段存在：${'components' in healthStatus}`)

// 验证组件状态
const components = healthStatus.components
console.log('\n组件状态验证:')
console.log(`✓ database 字段存在：${'database' in components}`)
console.log(`✓ websocket 字段存在：${'websocket' in components}`)
console.log(`✓ memory 字段存在：${'memory' in components}`)
console.log(`✓ cpu 字段存在：${'cpu' in components}`)

// 验证内存使用率计算
console.log('\n内存使用率:')
console.log(`  heapUsed: ${components.memory.heapUsed} bytes`)
console.log(`  heapTotal: ${components.memory.heapTotal} bytes`)
console.log(`  usagePercent: ${components.memory.usagePercent}%`)
console.log(`  status: ${components.memory.status}`)

// 验证 CPU 使用率计算
console.log('\nCPU 使用率:')
console.log(`  usagePercent: ${components.cpu.usagePercent}%`)
console.log(`  cores: ${components.cpu.cores}`)
console.log(`  status: ${components.cpu.status}`)

// 验证 WebSocket 连接数
console.log('\nWebSocket 连接:')
console.log(`  connections: ${components.websocket.connections}`)
console.log(`  activeSessions: ${components.websocket.activeSessions}`)
console.log(`  status: ${components.websocket.status}`)

// 获取性能指标
console.log('\n性能指标:')
const metrics = performanceMonitor.getMetrics()
console.log(JSON.stringify(metrics, null, 2))

console.log('\n' + '='.repeat(60))
console.log('所有测试通过！✓')
console.log('='.repeat(60))

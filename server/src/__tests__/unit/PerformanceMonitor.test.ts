/**
 * 性能监控器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PerformanceMonitor, getPerformanceMonitor } from '../../monitoring/PerformanceMonitor'

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor
  
  beforeEach(() => {
    monitor = new PerformanceMonitor()
  })
  
  describe('record', () => {
    it('应该记录性能指标', () => {
      monitor.record('test.endpoint', 100, true)
      const report = monitor.generateReport()
      expect(report['test.endpoint']).toBeDefined()
      expect(report['test.endpoint'].count).toBe(1)
    })
    
    it('应该记录带元数据的指标', () => {
      monitor.record('test.endpoint', 150, false, { userId: '123' })
      const report = monitor.generateReport()
      expect(report['test.endpoint'].count).toBe(1)
      expect(report['test.endpoint'].errorRate).toBe(1)
    })
    
    it('应该限制每个端点的指标数量', () => {
      for (let i = 0; i < 1001; i++) {
        monitor.record('test.endpoint', i, true)
      }
      const report = monitor.generateReport()
      expect(report['test.endpoint'].count).toBe(1000)
    })
  })
  
  describe('generateReport', () => {
    it('应该生成空报告（无数据）', () => {
      const report = monitor.generateReport()
      expect(Object.keys(report)).toHaveLength(0)
    })
    
    it('应该为特定端点生成报告', () => {
      monitor.record('endpoint.a', 100, true)
      monitor.record('endpoint.a', 200, true)
      monitor.record('endpoint.b', 300, true)
      
      const report = monitor.generateReport('endpoint.a')
      expect(Object.keys(report)).toHaveLength(1)
      expect(report['endpoint.a'].count).toBe(2)
    })
    
    it('应该计算正确的统计值', () => {
      // 添加测试数据
      monitor.record('test', 100, true)
      monitor.record('test', 200, true)
      monitor.record('test', 300, true)
      monitor.record('test', 400, true)
      monitor.record('test', 500, true)
      
      const stats = monitor.generateReport()['test']
      expect(stats.count).toBe(5)
      expect(stats.avg).toBe(300)
      expect(stats.p50).toBeGreaterThanOrEqual(100)
      expect(stats.p95).toBeLessThanOrEqual(500)
      expect(stats.p99).toBeLessThanOrEqual(500)
    })
    
    it('应该计算错误率', () => {
      monitor.record('test', 100, true)
      monitor.record('test', 100, true)
      monitor.record('test', 100, false)
      monitor.record('test', 100, false)
      
      const stats = monitor.generateReport()['test']
      expect(stats.errorRate).toBeCloseTo(0.5, 2)
    })
  })
  
  describe('checkAlerts', () => {
    it('应该在没有告警时返回空数组', () => {
      monitor.record('test', 100, true)
      monitor.record('test', 200, true)
      
      const alerts = monitor.checkAlerts({ p95Ms: 1000, errorRatePercent: 5 })
      expect(alerts).toHaveLength(0)
    })
    
    it('应该在延迟高时生成延迟告警', () => {
      monitor.record('slow', 2000, true)
      monitor.record('slow', 2500, true)
      
      const alerts = monitor.checkAlerts({ p95Ms: 1000, errorRatePercent: 5 })
      expect(alerts.some(a => a.type === 'HIGH_LATENCY')).toBe(true)
      expect(alerts.some(a => a.endpoint === 'slow')).toBe(true)
    })
    
    it('应该在错误率高时生成错误率告警', () => {
      for (let i = 0; i < 10; i++) {
        monitor.record('error-prone', 100, i < 5) // 50% 错误率
      }
      
      const alerts = monitor.checkAlerts({ p95Ms: 1000, errorRatePercent: 5 })
      expect(alerts.some(a => a.type === 'HIGH_ERROR_RATE')).toBe(true)
    })
  })
  
  describe('clear', () => {
    it('应该清空所有指标', () => {
      monitor.record('test1', 100, true)
      monitor.record('test2', 200, true)
      
      monitor.clear()
      const report = monitor.generateReport()
      expect(Object.keys(report)).toHaveLength(0)
    })
    
    it('应该只清空指定端点的指标', () => {
      monitor.record('test1', 100, true)
      monitor.record('test2', 200, true)
      
      monitor.clear('test1')
      const report = monitor.generateReport()
      expect(report['test1']).toBeUndefined()
      expect(report['test2']).toBeDefined()
    })
  })
  
  describe('getPerformanceMonitor', () => {
    it('应该返回单例实例', () => {
      const instance1 = getPerformanceMonitor()
      const instance2 = getPerformanceMonitor()
      expect(instance1).toBe(instance2)
    })
  })
})

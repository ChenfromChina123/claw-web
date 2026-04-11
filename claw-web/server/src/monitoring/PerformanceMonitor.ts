/**
 * 性能监控器
 * 记录和统计关键性能指标
 */

interface MetricPoint {
  endpoint: string
  duration: number
  success: boolean
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface PerformanceStats {
  p50: number
  p95: number
  p99: number
  avg: number
  count: number
  errorRate: number
}

export class PerformanceMonitor {
  private metrics: Map<string, MetricPoint[]> = new Map()
  private static readonly MAX_METRICS_PER_ENDPOINT = 1000
  
  /**
   * 记录性能指标
   */
  record(
    endpoint: string, 
    duration: number, 
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, [])
    }
    
    const points = this.metrics.get(endpoint)!
    points.push({
      endpoint,
      duration,
      success,
      timestamp: Date.now(),
      metadata,
    })
    
    // 限制存储数量
    if (points.length > PerformanceMonitor.MAX_METRICS_PER_ENDPOINT) {
      points.shift()
    }
  }
  
  /**
   * 生成性能统计报告
   */
  generateReport(endpoint?: string): Record<string, PerformanceStats> {
    const result: Record<string, PerformanceStats> = {}
    
    const endpoints = endpoint 
      ? [endpoint] 
      : Array.from(this.metrics.keys())
    
    for (const ep of endpoints) {
      const points = this.metrics.get(ep) || []
      if (points.length === 0) continue
      
      const durations = points.map(p => p.duration).sort((a, b) => a - b)
      const errors = points.filter(p => !p.success).length
      
      result[ep] = {
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        count: durations.length,
        errorRate: errors / durations.length,
      }
    }
    
    return result
  }
  
  /**
   * 检查性能告警
   */
  checkAlerts(thresholds: {
    p95Ms: number
    errorRatePercent: number
  }): Array<{ endpoint: string; type: string; value: number }> {
    const alerts: Array<{ endpoint: string; type: string; value: number }> = []
    const report = this.generateReport()
    
    for (const [endpoint, stats] of Object.entries(report)) {
      if (stats.p95 > thresholds.p95Ms) {
        alerts.push({
          endpoint,
          type: 'HIGH_LATENCY',
          value: stats.p95,
        })
      }
      
      if (stats.errorRate > thresholds.errorRatePercent / 100) {
        alerts.push({
          endpoint,
          type: 'HIGH_ERROR_RATE',
          value: stats.errorRate * 100,
        })
      }
    }
    
    return alerts
  }
  
  /**
   * 清空监控数据
   */
  clear(endpoint?: string): void {
    if (endpoint) {
      this.metrics.delete(endpoint)
    } else {
      this.metrics.clear()
    }
  }
  
  private percentile(sortedData: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedData.length) - 1
    return sortedData[Math.max(0, index)]
  }
}

// 单例模式
let instance: PerformanceMonitor | null = null
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor()
  }
  return instance
}

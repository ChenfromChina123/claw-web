/**
 * 性能监控 API 路由
 *
 * 提供的端点：
 * - GET /api/monitoring/performance - 获取性能统计
 * - GET /api/monitoring/resources - 获取资源使用情况
 * - GET /api/monitoring/health - 获取系统健康状态
 * - GET /api/monitoring/containers - 获取容器状态
 */

import type { Request, Response } from 'express'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { requireAdminAuth } from '../middleware/adminAuth'
import { getPool } from '../db/mysql'
import { cpus, totalmem, freemem, loadavg } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * 处理性能监控相关的 HTTP 请求
 */
export async function handleMonitoringRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  // 获取性能统计
  // GET /api/monitoring/performance
  if (path === '/api/monitoring/performance' && method === 'GET') {
    return handleGetPerformance(req)
  }

  // 获取资源使用情况
  // GET /api/monitoring/resources
  if (path === '/api/monitoring/resources' && method === 'GET') {
    return handleGetResources(req)
  }

  // 获取系统健康状态
  // GET /api/monitoring/health
  if (path === '/api/monitoring/health' && method === 'GET') {
    return handleGetHealth(req)
  }

  // 获取容器状态
  // GET /api/monitoring/containers
  if (path === '/api/monitoring/containers' && method === 'GET') {
    return handleGetContainers(req)
  }

  return null
}

/**
 * 获取性能统计
 */
async function handleGetPerformance(req: Request): Promise<Response> {
  try {
    const authResult = await requireAdminAuth(req)
    if ('status' in authResult) {
      return authResult
    }

    // 获取数据库查询统计
    const pool = await import('../db/mysql').then(m => m.getPool())
    const [dbStats] = await pool.query('SHOW GLOBAL STATUS LIKE "Questions"') as [any[], unknown]
    const [dbConnections] = await pool.query('SHOW GLOBAL STATUS LIKE "Threads_connected"') as [any[], unknown]
    const [dbSlowQueries] = await pool.query('SHOW GLOBAL STATUS LIKE "Slow_queries"') as [any[], unknown]

    // 获取容器数量
    let containerCount = 0
    try {
      const { stdout } = await execAsync('docker ps -q | wc -l')
      containerCount = parseInt(stdout.trim(), 10) || 0
    } catch {
      containerCount = 0
    }

    const performanceData = {
      database: {
        queries: dbStats[0]?.Value || 0,
        connections: dbConnections[0]?.Value || 0,
        slowQueries: dbSlowQueries[0]?.Value || 0
      },
      containers: {
        running: containerCount
      },
      system: {
        loadAverage: loadavg(),
        cpuCount: cpus().length
      },
      timestamp: new Date().toISOString()
    }

    return createSuccessResponse(performanceData)
  } catch (error) {
    console.error('[MonitoringRoutes] 获取性能统计失败:', error)
    return createErrorResponse('GET_PERFORMANCE_FAILED', '获取性能统计失败', 500)
  }
}

/**
 * 获取资源使用情况
 */
async function handleGetResources(req: Request): Promise<Response> {
  try {
    const authResult = await requireAdminAuth(req)
    if ('status' in authResult) {
      return authResult
    }

    // 获取系统资源
    const cpuList = cpus()
    const totalMemory = totalmem()
    const freeMemory = freemem()
    const usedMemory = totalMemory - freeMemory

    // 计算 CPU 使用率（简化计算）
    let totalIdle = 0
    let totalTick = 0
    for (const cpu of cpuList) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times]
      }
      totalIdle += cpu.times.idle
    }
    const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(2)

    // 获取进程信息
    let processCount = 0
    let memoryInfo: Record<string, number> = {}
    try {
      const { stdout: psOutput } = await execAsync('ps aux | wc -l')
      processCount = parseInt(psOutput.trim(), 10) - 1 || 0

      const { stdout: memOutput } = await execAsync("free -b | grep Mem | awk '{print $2,$3,$4}'")
      const [total, used, free] = memOutput.trim().split(' ').map(Number)
      memoryInfo = { total, used, free }
    } catch {
      memoryInfo = { total: totalMemory, used: usedMemory, free: freeMemory }
    }

    const resources = {
      cpu: {
        usagePercent: parseFloat(cpuUsage),
        coreCount: cpuList.length,
        model: cpuList[0]?.model || 'Unknown',
        loadAverage: loadavg()
      },
      memory: {
        totalBytes: memoryInfo.total || totalMemory,
        usedBytes: memoryInfo.used || usedMemory,
        freeBytes: memoryInfo.free || freeMemory,
        usagePercent: ((memoryInfo.used || usedMemory) / (memoryInfo.total || totalMemory) * 100).toFixed(2)
      },
      process: {
        count: processCount
      },
      timestamp: new Date().toISOString()
    }

    return createSuccessResponse(resources)
  } catch (error) {
    console.error('[MonitoringRoutes] 获取资源使用情况失败:', error)
    return createErrorResponse('GET_RESOURCES_FAILED', '获取资源使用情况失败', 500)
  }
}

/**
 * 获取系统健康状态
 */
async function handleGetHealth(req: Request): Promise<Response> {
  try {
    const pool = getPool()

    // 检查数据库连接
    let dbHealthy = false
    try {
      await pool.query('SELECT 1')
      dbHealthy = true
    } catch {
      dbHealthy = false
    }

    // 检查 Docker 服务
    let dockerHealthy = false
    try {
      await execAsync('docker info')
      dockerHealthy = true
    } catch {
      dockerHealthy = false
    }

    // 检查磁盘空间
    let diskHealthy = true
    let diskUsage = 0
    try {
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'")
      diskUsage = parseInt(stdout.trim(), 10) || 0
      diskHealthy = diskUsage < 90
    } catch {
      diskHealthy = false
    }

    const healthStatus = {
      status: dbHealthy && dockerHealthy && diskHealthy ? 'healthy' : 'degraded',
      components: {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          message: dbHealthy ? '连接正常' : '连接失败'
        },
        docker: {
          status: dockerHealthy ? 'healthy' : 'unhealthy',
          message: dockerHealthy ? '运行正常' : '服务不可用'
        },
        disk: {
          status: diskHealthy ? 'healthy' : 'warning',
          usage: diskUsage,
          message: diskHealthy ? '空间充足' : `空间使用率 ${diskUsage}%`
        }
      },
      timestamp: new Date().toISOString()
    }

    return createSuccessResponse(healthStatus)
  } catch (error) {
    console.error('[MonitoringRoutes] 获取健康状态失败:', error)
    return createErrorResponse('GET_HEALTH_FAILED', '获取健康状态失败', 500)
  }
}

/**
 * 获取容器状态
 */
async function handleGetContainers(req: Request): Promise<Response> {
  try {
    const authResult = await requireAdminAuth(req)
    if ('status' in authResult) {
      return authResult
    }

    // 获取容器列表
    let containers: any[] = []
    try {
      const { stdout } = await execAsync(
        'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.State}}|{{.Image}}|{{.CreatedAt}}|{{.Ports}}"'
      )
      const lines = stdout.trim().split('\n').filter(Boolean)

      containers = lines.map(line => {
        const [id, name, status, state, image, created, ports] = line.split('|')
        return { id, name, status, state, image, created, ports }
      })
    } catch (error) {
      console.error('[MonitoringRoutes] 获取容器列表失败:', error)
    }

    // 获取资源使用情况
    let containerStats: any[] = []
    try {
      const { stdout } = await execAsync(
        'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"'
      )
      const lines = stdout.trim().split('\n').filter(Boolean)

      containerStats = lines.map(line => {
        const [name, cpu, memUsage, memPerc] = line.split('|')
        return { name, cpu, memUsage, memPerc }
      })
    } catch (error) {
      console.error('[MonitoringRoutes] 获取容器统计失败:', error)
    }

    // 合并数据
    const containerData = containers.map(c => {
      const stats = containerStats.find(s => s.name === c.name) || {}
      return { ...c, ...stats }
    })

    return createSuccessResponse({
      containers: containerData,
      total: containerData.length,
      running: containerData.filter(c => c.state === 'running').length,
      stopped: containerData.filter(c => c.state !== 'running').length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[MonitoringRoutes] 获取容器状态失败:', error)
    return createErrorResponse('GET_CONTAINERS_FAILED', '获取容器状态失败', 500)
  }
}

export default handleMonitoringRoutes

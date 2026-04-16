/**
 * Worker 进程管理器
 * 
 * 功能：
 * - 在 Worker 容器内管理多个用户项目进程
 * - 支持 PM2（Node.js 项目）和 Supervisor（Python/通用项目）
 * - 动态分配容器内端口
 * - 进程状态监控和日志收集
 * 
 * 使用场景：
 * - 在已分配的 Worker 容器内部署和运行用户项目
 * - 一个 Worker 容器可运行多个项目
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 项目配置
 */
export interface ProjectConfig {
  projectId: string
  userId: string
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  sourcePath: string
  buildCommand?: string
  startCommand: string
  envVars?: Record<string, string>
  memoryLimit?: string
  processManager: 'pm2' | 'supervisor'
}

/**
 * 进程状态
 */
export interface ProcessStatus {
  running: boolean
  pid?: number
  memory?: number
  cpu?: number
  uptime?: number
  status?: string
  port?: number
}

/**
 * 进程启动结果
 */
export interface ProcessStartResult {
  success: boolean
  port: number
  processId: string
  error?: string
}

/**
 * 日志结果
 */
export interface LogResult {
  stdout: string
  stderr: string
}

// ==================== Worker 进程管理器 ====================

export class WorkerProcessManager {
  private containerId: string
  private portRange: { start: number; end: number }

  constructor(containerId: string, portRange = { start: 3100, end: 3200 }) {
    this.containerId = containerId
    this.portRange = portRange
  }

  /**
   * 在 Worker 容器内启动项目进程
   */
  async startProject(config: ProjectConfig): Promise<ProcessStartResult> {
    try {
      // 1. 分配容器内端口
      const port = await this.allocateInternalPort()

      // 2. 准备项目目录
      const projectPath = `/app/workspaces/users/${config.userId}/projects/${config.projectId}`
      await this.execInContainer(`mkdir -p ${projectPath}`)

      // 3. 根据项目类型选择进程管理器
      if (config.processManager === 'pm2') {
        return await this.startWithPM2(projectPath, port, config)
      } else {
        return await this.startWithSupervisor(projectPath, port, config)
      }
    } catch (error) {
      console.error('[WorkerProcessManager] 启动项目失败:', error)
      return {
        success: false,
        port: 0,
        processId: config.projectId,
        error: error instanceof Error ? error.message : '启动失败'
      }
    }
  }

  /**
   * 使用 PM2 启动 Node.js 项目
   */
  private async startWithPM2(
    projectPath: string,
    port: number,
    config: ProjectConfig
  ): Promise<ProcessStartResult> {
    try {
      // 生成 PM2 配置文件
      const pm2Config = {
        name: config.projectId,
        script: config.startCommand,
        cwd: projectPath,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: config.memoryLimit || '256M',
        env: {
          PORT: port,
          NODE_ENV: 'production',
          PROJECT_ID: config.projectId,
          USER_ID: config.userId,
          ...config.envVars
        },
        error_file: `/app/logs/${config.projectId}-error.log`,
        out_file: `/app/logs/${config.projectId}-out.log`,
        pid_file: `/app/logs/${config.projectId}.pid`
      }

      // 写入配置文件
      await this.execInContainer(
        `echo '${JSON.stringify(pm2Config)}' > ${projectPath}/ecosystem.config.js`
      )

      // 如果有构建命令，先执行构建
      if (config.buildCommand) {
        await this.execInContainer(`cd ${projectPath} && ${config.buildCommand}`)
      }

      // 使用 PM2 启动
      await this.execInContainer(`cd ${projectPath} && pm2 start ecosystem.config.js`)

      console.log(`[WorkerProcessManager] PM2 项目已启动: ${config.projectId} (端口: ${port})`)

      return {
        success: true,
        port,
        processId: config.projectId
      }
    } catch (error) {
      console.error('[WorkerProcessManager] PM2 启动失败:', error)
      throw error
    }
  }

  /**
   * 使用 Supervisor 启动项目
   */
  private async startWithSupervisor(
    projectPath: string,
    port: number,
    config: ProjectConfig
  ): Promise<ProcessStartResult> {
    try {
      // 生成环境变量字符串
      const envString = Object.entries({
        PORT: port.toString(),
        PROJECT_ID: config.projectId,
        USER_ID: config.userId,
        ...config.envVars
      })
        .map(([k, v]) => `${k}="${v}"`)
        .join(',')

      // 生成 Supervisor 配置
      const supervisorConfig = `[program:${config.projectId}]
command=${config.startCommand}
directory=${projectPath}
autostart=true
autorestart=true
stderr_logfile=/app/logs/${config.projectId}-error.log
stdout_logfile=/app/logs/${config.projectId}-out.log
environment=${envString}
user=bun
stopasgroup=true
killasgroup=true
`

      // 写入配置文件
      await this.execInContainer(
        `echo '${supervisorConfig}' > /etc/supervisor/conf.d/${config.projectId}.conf`
      )

      // 如果有构建命令，先执行构建
      if (config.buildCommand) {
        await this.execInContainer(`cd ${projectPath} && ${config.buildCommand}`)
      }

      // 重新加载 Supervisor 配置
      await this.execInContainer('supervisorctl reread')
      await this.execInContainer('supervisorctl update')

      console.log(`[WorkerProcessManager] Supervisor 项目已启动: ${config.projectId} (端口: ${port})`)

      return {
        success: true,
        port,
        processId: config.projectId
      }
    } catch (error) {
      console.error('[WorkerProcessManager] Supervisor 启动失败:', error)
      throw error
    }
  }

  /**
   * 停止项目进程
   */
  async stopProject(projectId: string, processManager: 'pm2' | 'supervisor'): Promise<boolean> {
    try {
      if (processManager === 'pm2') {
        await this.execInContainer(`pm2 stop ${projectId}`)
        await this.execInContainer(`pm2 delete ${projectId}`)
      } else {
        await this.execInContainer(`supervisorctl stop ${projectId}`)
        await this.execInContainer(`rm /etc/supervisor/conf.d/${projectId}.conf`)
        await this.execInContainer('supervisorctl update')
      }

      console.log(`[WorkerProcessManager] 项目已停止: ${projectId}`)
      return true
    } catch (error) {
      console.error('[WorkerProcessManager] 停止项目失败:', error)
      return false
    }
  }

  /**
   * 重启项目进程
   */
  async restartProject(projectId: string, processManager: 'pm2' | 'supervisor'): Promise<boolean> {
    try {
      if (processManager === 'pm2') {
        await this.execInContainer(`pm2 restart ${projectId}`)
      } else {
        await this.execInContainer(`supervisorctl restart ${projectId}`)
      }

      console.log(`[WorkerProcessManager] 项目已重启: ${projectId}`)
      return true
    } catch (error) {
      console.error('[WorkerProcessManager] 重启项目失败:', error)
      return false
    }
  }

  /**
   * 获取项目状态
   */
  async getProjectStatus(
    projectId: string,
    processManager: 'pm2' | 'supervisor'
  ): Promise<ProcessStatus> {
    try {
      if (processManager === 'pm2') {
        const { stdout } = await this.execInContainer('pm2 jlist')
        const processes = JSON.parse(stdout)
        const process = processes.find((p: any) => p.name === projectId)

        if (!process) {
          return { running: false }
        }

        return {
          running: process.pm2_env?.status === 'online',
          pid: process.pid,
          memory: process.monit?.memory,
          cpu: process.monit?.cpu,
          uptime: process.pm2_env?.pm_uptime,
          status: process.pm2_env?.status
        }
      } else {
        const { stdout } = await this.execInContainer(`supervisorctl status ${projectId}`)

        const isRunning = stdout.includes('RUNNING')
        const pidMatch = stdout.match(/pid\s+(\d+)/)

        return {
          running: isRunning,
          pid: pidMatch ? parseInt(pidMatch[1]) : undefined,
          status: stdout.trim()
        }
      }
    } catch (error) {
      console.error('[WorkerProcessManager] 获取状态失败:', error)
      return { running: false }
    }
  }

  /**
   * 获取项目日志
   */
  async getProjectLogs(projectId: string, lines: number = 100): Promise<LogResult> {
    try {
      const { stdout } = await this.execInContainer(
        `tail -n ${lines} /app/logs/${projectId}-out.log 2>/dev/null || echo ""`
      )

      const { stdout: stderr } = await this.execInContainer(
        `tail -n ${lines} /app/logs/${projectId}-error.log 2>/dev/null || echo ""`
      )

      return { stdout, stderr }
    } catch (error) {
      console.error('[WorkerProcessManager] 获取日志失败:', error)
      return { stdout: '', stderr: '' }
    }
  }

  /**
   * 列出所有运行的项目
   */
  async listProjects(): Promise<string[]> {
    try {
      // 获取 PM2 项目
      const { stdout: pm2List } = await this.execInContainer('pm2 jlist 2>/dev/null || echo "[]"')
      const pm2Processes = JSON.parse(pm2List)
      const pm2Projects = pm2Processes.map((p: any) => p.name)

      // 获取 Supervisor 项目
      const { stdout: supervisorList } = await this.execInContainer(
        'supervisorctl status 2>/dev/null | awk \'{print $1}\' || echo ""'
      )
      const supervisorProjects = supervisorList
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      return [...pm2Projects, ...supervisorProjects]
    } catch (error) {
      console.error('[WorkerProcessManager] 列出项目失败:', error)
      return []
    }
  }

  /**
   * 分配容器内端口
   */
  private async allocateInternalPort(): Promise<number> {
    try {
      // 查询容器内已使用的端口
      const { stdout } = await this.execInContainer(
        'netstat -tuln 2>/dev/null | grep LISTEN | awk \'{print $4}\' | cut -d: -f2 || echo ""'
      )

      const usedPorts = stdout
        .split('\n')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p > 0)

      // 从端口范围开始分配
      for (let port = this.portRange.start; port <= this.portRange.end; port++) {
        if (!usedPorts.includes(port)) {
          return port
        }
      }

      throw new Error('容器内端口已用完')
    } catch (error) {
      console.error('[WorkerProcessManager] 分配端口失败:', error)
      throw error
    }
  }

  /**
   * 在容器内执行命令
   */
  private async execInContainer(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execAsync(`docker exec ${this.containerId} bash -c "${command}"`)
      return { stdout, stderr }
    } catch (error: any) {
      // 如果命令返回非零退出码，仍然返回输出
      if (error.stdout !== undefined) {
        return { stdout: error.stdout, stderr: error.stderr || '' }
      }
      throw error
    }
  }

  /**
   * 获取容器资源使用情况
   */
  async getResourceUsage(): Promise<{
    cpuPercent: number
    memoryMB: number
    memoryPercent: number
  }> {
    try {
      const { stdout } = await execAsync(
        `docker stats ${this.containerId} --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`
      )

      const [cpuStr, memStr] = stdout.trim().split(',')

      const cpuPercent = parseFloat(cpuStr.replace('%', ''))
      const memMatch = memStr.match(/(\d+\.?\d*)MiB\s*\/\s*(\d+\.?\d*)MiB/)

      if (memMatch) {
        return {
          cpuPercent,
          memoryMB: parseFloat(memMatch[1]),
          memoryPercent: (parseFloat(memMatch[1]) / parseFloat(memMatch[2])) * 100
        }
      }

      return { cpuPercent, memoryMB: 0, memoryPercent: 0 }
    } catch (error) {
      console.error('[WorkerProcessManager] 获取资源使用失败:', error)
      return { cpuPercent: 0, memoryMB: 0, memoryPercent: 0 }
    }
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 Worker 进程管理器实例
 */
export function createWorkerProcessManager(
  containerId: string,
  portRange?: { start: number; end: number }
): WorkerProcessManager {
  return new WorkerProcessManager(containerId, portRange)
}

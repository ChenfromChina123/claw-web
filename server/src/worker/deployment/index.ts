/**
 * Worker 内部部署管理服务
 *
 * 功能：
 * - 在 Worker 容器内管理项目部署
 * - 进程管理（PM2/Supervisor）
 * - 端口分配
 * - 日志收集
 *
 * 使用场景：
 * - 接收 Master 的部署指令
 * - 管理容器内的项目生命周期
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
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
 * 部署结果
 */
export interface DeployResult {
  success: boolean
  projectId: string
  port: number
  error?: string
}

/**
 * 项目状态
 */
export interface ProjectStatus {
  running: boolean
  pid?: number
  memory?: number
  cpu?: number
  uptime?: number
  status?: string
  port?: number
}

/**
 * 日志结果
 */
export interface LogResult {
  stdout: string
  stderr: string
}

// ==================== Worker 部署管理器 ====================

export class WorkerDeploymentManager {
  private portRange: { start: number; end: number }
  private projectsDir: string

  constructor(portRange = { start: 10000, end: 20000 }) {
    this.portRange = portRange
    this.projectsDir = '/workspace/projects'
  }

  /**
   * 部署项目
   */
  async deployProject(config: ProjectConfig): Promise<DeployResult> {
    try {
      // 分配端口
      const port = await this.allocatePort()

      // 创建项目目录
      const projectDir = path.join(this.projectsDir, config.userId, config.projectId)
      await this.ensureDir(projectDir)

      // 根据进程管理器启动项目
      if (config.processManager === 'pm2') {
        await this.deployWithPM2(projectDir, port, config)
      } else {
        await this.deployWithSupervisor(projectDir, port, config)
      }

      // 保存部署信息
      await this.saveDeployInfo(projectDir, { ...config, port })

      return {
        success: true,
        projectId: config.projectId,
        port
      }
    } catch (error) {
      console.error('[WorkerDeploymentManager] 部署失败:', error)
      return {
        success: false,
        projectId: config.projectId,
        port: 0,
        error: error instanceof Error ? error.message : '部署失败'
      }
    }
  }

  /**
   * 使用 PM2 部署 Node.js 项目
   */
  private async deployWithPM2(
    projectDir: string,
    port: number,
    config: ProjectConfig
  ): Promise<void> {
    // 生成 PM2 配置文件
    const pm2Config = {
      name: config.projectId,
      script: config.startCommand,
      cwd: projectDir,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: config.memoryLimit || '256M',
      env: {
        PORT: port.toString(),
        NODE_ENV: 'production',
        PROJECT_ID: config.projectId,
        USER_ID: config.userId,
        ...config.envVars
      },
      error_file: `/workspace/logs/${config.projectId}-error.log`,
      out_file: `/workspace/logs/${config.projectId}-out.log`,
      pid_file: `/workspace/logs/${config.projectId}.pid`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }

    // 写入配置文件
    const configPath = path.join(projectDir, 'ecosystem.config.js')
    await fs.writeFile(
      configPath,
      `module.exports = ${JSON.stringify(pm2Config, null, 2)}`,
      'utf-8'
    )

    // 执行构建命令
    if (config.buildCommand) {
      console.log(`[WorkerDeploymentManager] 执行构建: ${config.buildCommand}`)
      const { stdout, stderr } = await execAsync(`cd ${projectDir} && ${config.buildCommand}`)
      if (stderr) console.warn('[WorkerDeploymentManager] 构建警告:', stderr)
      console.log('[WorkerDeploymentManager] 构建输出:', stdout)
    }

    // 使用 PM2 启动
    await execAsync(`pm2 start ${configPath}`)
    await execAsync('pm2 save')

    console.log(`[WorkerDeploymentManager] PM2 项目已启动: ${config.projectId} (端口: ${port})`)
  }

  /**
   * 使用 Supervisor 部署项目
   */
  private async deployWithSupervisor(
    projectDir: string,
    port: number,
    config: ProjectConfig
  ): Promise<void> {
    // 生成环境变量字符串
    const envVars = {
      PORT: port.toString(),
      PROJECT_ID: config.projectId,
      USER_ID: config.userId,
      ...config.envVars
    }
    const envString = Object.entries(envVars)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')

    // 生成 Supervisor 配置
    const supervisorConfig = `[program:${config.projectId}]
command=${config.startCommand}
directory=${projectDir}
autostart=true
autorestart=true
stderr_logfile=/workspace/logs/${config.projectId}-error.log
stdout_logfile=/workspace/logs/${config.projectId}-out.log
environment=${envString}
user=root
stopasgroup=true
killasgroup=true
`

    // 写入配置文件
    const configPath = `/etc/supervisor/conf.d/${config.projectId}.conf`
    await fs.writeFile(configPath, supervisorConfig, 'utf-8')

    // 执行构建命令
    if (config.buildCommand) {
      console.log(`[WorkerDeploymentManager] 执行构建: ${config.buildCommand}`)
      const { stdout, stderr } = await execAsync(`cd ${projectDir} && ${config.buildCommand}`)
      if (stderr) console.warn('[WorkerDeploymentManager] 构建警告:', stderr)
      console.log('[WorkerDeploymentManager] 构建输出:', stdout)
    }

    // 重新加载 Supervisor 配置
    await execAsync('supervisorctl reread')
    await execAsync('supervisorctl update')

    console.log(`[WorkerDeploymentManager] Supervisor 项目已启动: ${config.projectId} (端口: ${port})`)
  }

  /**
   * 停止项目
   */
  async stopProject(projectId: string, processManager: 'pm2' | 'supervisor'): Promise<boolean> {
    try {
      if (processManager === 'pm2') {
        await execAsync(`pm2 stop ${projectId}`)
        await execAsync(`pm2 delete ${projectId}`)
        await execAsync('pm2 save')
      } else {
        await execAsync(`supervisorctl stop ${projectId}`)
        await fs.unlink(`/etc/supervisor/conf.d/${projectId}.conf`).catch(() => {})
        await execAsync('supervisorctl reread')
        await execAsync('supervisorctl update')
      }

      console.log(`[WorkerDeploymentManager] 项目已停止: ${projectId}`)
      return true
    } catch (error) {
      console.error('[WorkerDeploymentManager] 停止项目失败:', error)
      return false
    }
  }

  /**
   * 重启项目
   */
  async restartProject(projectId: string, processManager: 'pm2' | 'supervisor'): Promise<boolean> {
    try {
      if (processManager === 'pm2') {
        await execAsync(`pm2 restart ${projectId}`)
      } else {
        await execAsync(`supervisorctl restart ${projectId}`)
      }

      console.log(`[WorkerDeploymentManager] 项目已重启: ${projectId}`)
      return true
    } catch (error) {
      console.error('[WorkerDeploymentManager] 重启项目失败:', error)
      return false
    }
  }

  /**
   * 获取项目状态
   */
  async getProjectStatus(
    projectId: string,
    processManager: 'pm2' | 'supervisor'
  ): Promise<ProjectStatus> {
    try {
      if (processManager === 'pm2') {
        const { stdout } = await execAsync('pm2 jlist')
        const processes = JSON.parse(stdout)
        const proc = processes.find((p: any) => p.name === projectId)

        if (!proc) {
          return { running: false }
        }

        return {
          running: proc.pm2_env?.status === 'online',
          pid: proc.pid,
          memory: proc.monit?.memory,
          cpu: proc.monit?.cpu,
          uptime: proc.pm2_env?.pm_uptime,
          status: proc.pm2_env?.status,
          port: proc.pm2_env?.env?.PORT
        }
      } else {
        const { stdout } = await execAsync(`supervisorctl status ${projectId}`)
        const isRunning = stdout.includes('RUNNING')
        const pidMatch = stdout.match(/pid\s+(\d+)/)

        return {
          running: isRunning,
          pid: pidMatch ? parseInt(pidMatch[1]) : undefined,
          status: stdout.trim()
        }
      }
    } catch (error) {
      console.error('[WorkerDeploymentManager] 获取状态失败:', error)
      return { running: false }
    }
  }

  /**
   * 获取项目日志
   */
  async getProjectLogs(projectId: string, lines: number = 100): Promise<LogResult> {
    try {
      const outLog = `/workspace/logs/${projectId}-out.log`
      const errLog = `/workspace/logs/${projectId}-error.log`

      let stdout = ''
      let stderr = ''

      try {
        const { stdout: out } = await execAsync(`tail -n ${lines} ${outLog} 2>/dev/null || echo ""`)
        stdout = out
      } catch {}

      try {
        const { stdout: err } = await execAsync(`tail -n ${lines} ${errLog} 2>/dev/null || echo ""`)
        stderr = err
      } catch {}

      return { stdout, stderr }
    } catch (error) {
      console.error('[WorkerDeploymentManager] 获取日志失败:', error)
      return { stdout: '', stderr: '' }
    }
  }

  /**
   * 列出所有项目
   */
  async listProjects(): Promise<Array<{ projectId: string; status: ProjectStatus }>> {
    try {
      const projects: Array<{ projectId: string; status: ProjectStatus }> = []

      // 获取 PM2 项目
      try {
        const { stdout } = await execAsync('pm2 jlist 2>/dev/null || echo "[]"')
        const processes = JSON.parse(stdout)
        for (const proc of processes) {
          projects.push({
            projectId: proc.name,
            status: {
              running: proc.pm2_env?.status === 'online',
              pid: proc.pid,
              memory: proc.monit?.memory,
              cpu: proc.monit?.cpu,
              status: proc.pm2_env?.status
            }
          })
        }
      } catch {}

      // 获取 Supervisor 项目
      try {
        const { stdout } = await execAsync('supervisorctl status 2>/dev/null || echo ""')
        const lines = stdout.split('\n').filter(l => l.trim())
        for (const line of lines) {
          const parts = line.split(/\s+/)
          if (parts.length >= 2) {
            projects.push({
              projectId: parts[0],
              status: {
                running: parts[1] === 'RUNNING',
                status: parts[1]
              }
            })
          }
        }
      } catch {}

      return projects
    } catch (error) {
      console.error('[WorkerDeploymentManager] 列出项目失败:', error)
      return []
    }
  }

  /**
   * 分配端口
   */
  private async allocatePort(): Promise<number> {
    try {
      // 获取已使用的端口
      const { stdout } = await execAsync(
        'netstat -tuln 2>/dev/null | grep LISTEN | awk \'{print $4}\' | cut -d: -f2 || echo ""'
      )

      const usedPorts = stdout
        .split('\n')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p > 0)

      // 从范围中分配
      for (let port = this.portRange.start; port <= this.portRange.end; port++) {
        if (!usedPorts.includes(port)) {
          return port
        }
      }

      throw new Error('端口已用完')
    } catch (error) {
      console.error('[WorkerDeploymentManager] 分配端口失败:', error)
      throw error
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  /**
   * 保存部署信息
   */
  private async saveDeployInfo(projectDir: string, config: ProjectConfig & { port: number }): Promise<void> {
    const infoPath = path.join(projectDir, '.deploy-info.json')
    await fs.writeFile(infoPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * 获取活跃的部署项目列表（用于防休眠检测）
   */
  async getActiveDeployments(): Promise<Array<{ projectId: string; name?: string; running: boolean; port?: number }>> {
    try {
      const projects = await this.listProjects()
      return projects
        .filter(p => p.status.running)
        .map(p => ({
          projectId: p.projectId,
          running: p.status.running,
          port: p.status.port
        }))
    } catch (error) {
      console.error('[WorkerDeploymentManager] 获取活跃部署失败:', error)
      return []
    }
  }

  /**
   * 读取部署信息
   */
  async getDeployInfo(userId: string, projectId: string): Promise<(ProjectConfig & { port: number }) | null> {
    try {
      const infoPath = path.join(this.projectsDir, userId, projectId, '.deploy-info.json')
      const content = await fs.readFile(infoPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }
}

// ==================== 单例实例 ====================

let deploymentManager: WorkerDeploymentManager | null = null

/**
 * 获取部署管理器实例
 */
export function getWorkerDeploymentManager(): WorkerDeploymentManager {
  if (!deploymentManager) {
    deploymentManager = new WorkerDeploymentManager()
  }
  return deploymentManager
}

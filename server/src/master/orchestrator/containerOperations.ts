/**
 * Docker 操作封装层
 *
 * 功能：
 * - 封装所有底层 Docker 命令执行
 * - 提供容器基础设施操作（网络、端口、权限等）
 * - 统一错误处理和日志记录
 *
 * 使用场景：
 * - 容器生命周期管理的基础依赖
 * - 提供安全、可靠的 Docker 操作接口
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import type { ContainerInstance, PoolConfig } from './types'
import { getWorkerInternalPort } from './types'

// 类型别名，用于内部使用
type RequiredPoolConfig = Required<PoolConfig>

const execAsync = promisify(exec)

// ==================== ContainerOperations 类 ====================

export class ContainerOperations {
  private config: RequiredPoolConfig

  constructor(config: RequiredPoolConfig) {
    this.config = config
  }

  /**
   * 构建 Docker 容器创建命令（统一方法）
   * @param config 容器配置
   * @returns docker run 命令字符串
   */
  buildDockerRunCommand(config: {
    containerName: string
    port: number
    workspacePath?: string | null
    resourceArgs: string[]
    userId?: string
    userTier?: any
    quota?: {
      storageQuotaMB: number
      maxSessions: number
      maxPtyProcesses: number
      maxFiles: number
      maxFileSizeMB: number
    }
  }): string {
    const { containerName, port, workspacePath, resourceArgs, userId, userTier, quota } = config

    // 基础安全加固参数
    // 使用 --privileged 提供最高权限，确保 PTY 功能正常工作
    const securityArgs = [
      '--privileged',
      '--tty',
      '--pids-limit 100',
      '--ulimit nproc=100:100',
      '--ulimit nofile=1024:1024'
    ]

    // 基础环境变量
    // 注意：LLM 服务统一在 Master 中，Worker 通过 MASTER_INTERNAL_TOKEN 访问 Master 的 LLM API
    const baseEnvVars = [
      `-e CONTAINER_ROLE=worker`,
      `-e NODE_ENV=production`,
      `-e MASTER_INTERNAL_TOKEN=${process.env.MASTER_INTERNAL_TOKEN || ''}`,
      `-e MASTER_HOST=${process.env.MASTER_HOST || 'claude-backend-master'}`,
      `-e MASTER_PORT=${process.env.MASTER_PORT || '3000'}`,
      `-e HOST=0.0.0.0`,
      `-e PORT=4000`,
      `-e WORKER_INTERNAL_PORT=4000`,
      `-e PTY_ENABLED=${process.env.PTY_ENABLED || 'true'}`
    ]

    // 用户相关环境变量（使用配额配置）
    const userEnvVars = userId
      ? [
          `-e TENANT_USER_ID=${userId}`,
          `-e WORKSPACE_BASE_DIR=/workspace`,
          `-e USER_STORAGE_QUOTA_MB=${quota?.storageQuotaMB || 500}`,
          `-e USER_SESSION_LIMIT=${quota?.maxSessions || 5}`,
          `-e USER_PTY_LIMIT=${quota?.maxPtyProcesses || 2}`,
          `-e MAX_FILES_PER_USER=${quota?.maxFiles || 500}`,
          `-e MAX_FILE_SIZE_MB=${quota?.maxFileSizeMB || 10}`
        ]
      : [
          `-e WORKSPACE_BASE_DIR=/workspace`,
          `-e USER_STORAGE_QUOTA_MB=${quota?.storageQuotaMB || 200}`,
          `-e USER_SESSION_LIMIT=${quota?.maxSessions || 5}`,
          `-e USER_PTY_LIMIT=${quota?.maxPtyProcesses || 2}`,
          `-e MAX_FILES_PER_USER=${quota?.maxFiles || 100}`,
          `-e MAX_FILE_SIZE_MB=${quota?.maxFileSizeMB || 10}`
        ]

    // Bind Mount 配置
    // 安全修复：只挂载当前用户的工作目录，避免路径重叠和覆盖问题
    //
    // 设计原则：
    // - 每个容器只有一个主要工作目录挂载到 /workspace
    // - 避免嵌套挂载导致的路径冲突
    // - 实现用户间完全隔离
    // - 热池容器不挂载工作空间（workspacePath 为 null）
    const bindMounts = []

    // 挂载用户工作空间目录
    if (workspacePath) {
      bindMounts.push(`-v ${workspacePath}:/workspace`)
    }

    // 开发模式：挂载源代码实现热更新
    // 注意：生产环境应该移除这些挂载
    if (process.env.NODE_ENV === 'development') {
      const workerSrcMount = process.env.WORKER_SRC_MOUNT || '/app/src/worker'
      const workerSharedMount = process.env.WORKER_SHARED_MOUNT || '/app/shared'
      bindMounts.push(`-v ${workerSrcMount}:/app/src:ro`)
      bindMounts.push(`-v ${workerSharedMount}:/app/shared:ro`)
    }

    // 构建完整命令
    const dockerCmd = [
      'docker run -d',
      `--name ${containerName}`,
      `-p ${port}:4000`,
      `--network ${this.config.networkName}`,
      '--restart unless-stopped',
      ...securityArgs,
      ...resourceArgs,
      ...bindMounts,
      ...baseEnvVars,
      ...userEnvVars,
      this.config.imageName
    ].join(' ')

    return dockerCmd
  }

  /**
   * 检查Docker服务是否可用
   */
  async checkDockerAvailability(): Promise<boolean> {
    try {
      // 尝试多种方式检测Docker
      // 1. 直接执行docker命令
      await execAsync('docker info')
      return true
    } catch (error) {
      console.warn('[ContainerOperations] Docker命令执行失败:', error)
      
      try {
        // 2. 检查Docker socket文件是否存在
        const fs = require('fs')
        const socketPath = '/var/run/docker.sock'
        if (fs.existsSync(socketPath)) {
          console.log('[ContainerOperations] Docker socket存在，假设Docker可用')
          return true
        }
      } catch (error) {
        console.warn('[ContainerOperations] 检查Docker socket失败:', error)
      }
      
      return false
    }
  }

  /**
   * 检查并创建Docker网络（如果不存在）
   */
  async ensureNetworkExists(): Promise<boolean> {
    try {
      // 检查网络是否存在
      await execAsync(`docker network inspect ${this.config.networkName}`)
      console.log(`[ContainerOperations] 网络 ${this.config.networkName} 已存在`)
      return true
    } catch (error) {
      // 网络不存在，尝试创建网络
      try {
        await execAsync(`docker network create ${this.config.networkName}`)
        console.log(`[ContainerOperations] 网络 ${this.config.networkName} 创建成功`)
        return true
      } catch (createError: any) {
        // 如果创建失败是因为网络已存在（并发情况），也认为是成功的
        if (createError?.message?.includes('already exists')) {
          console.log(`[ContainerOperations] 网络 ${this.config.networkName} 已存在（并发创建）`)
          return true
        }
        // 如果是 Docker 客户端版本问题，记录警告但继续运行
        // 因为网络可能已经在 docker-compose 中创建
        console.warn(`[ContainerOperations] 创建网络 ${this.config.networkName} 失败:`, createError)
        console.warn(`[ContainerOperations] 将继续运行，假设网络已由 docker-compose 创建`)
        return true
      }
    }
  }

  /**
   * 分配下一个可用端口（带冲突检测）
   */
  async allocatePort(): Promise<number> {
    const maxPort = this.config.basePort + 200 // 最大尝试端口范围

    for (let offset = 0; offset < 200; offset++) {
      const port = this.config.basePort + offset

      // 检查端口是否已被系统占用
      const isAvailable = await this.isPortAvailable(port)
      if (isAvailable) {
        console.log(`[ContainerOperations] 成功分配端口: ${port}`)
        return port
      }

      console.warn(`[ContainerOperations] 端口 ${port} 已被占用，尝试下一个端口`)
    }

    throw new Error(`无法分配可用端口，范围 ${this.config.basePort}-${maxPort} 已被耗尽`)
  }

  /**
   * 检查端口是否可用（使用多种方法）
   */
  async isPortAvailable(port: number): Promise<boolean> {
    try {
      // 方法1: 使用 net 模块检查本地端口
      const net = require('net')
      const isLocalAvailable = await new Promise<boolean>((resolve) => {
        const server = net.createServer()
        
        server.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            resolve(false)
          } else {
            resolve(true)
          }
        })
        
        server.once('listening', () => {
          server.close()
          resolve(true)
        })
        
        server.listen(port, '0.0.0.0')
      })
      
      if (!isLocalAvailable) {
        return false
      }
      
      // 方法2: 检查 Docker 是否已在使用该端口
      try {
        const { stdout } = await execAsync(`docker ps --filter "publish=${port}" --format "{{.Names}}"`)
        if (stdout.trim()) {
          console.warn(`[ContainerOperations] 端口 ${port} 已被 Docker 容器使用: ${stdout.trim()}`)
          return false
        }
      } catch {
        // 命令失败，继续检查
      }
      
      // 方法3: 检查系统中是否有进程在监听该端口
      try {
        const isWindows = process.platform === 'win32'
        if (isWindows) {
          // Windows: 使用 netstat 检查
          const { stdout } = await execAsync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`)
          if (stdout.trim()) {
            console.warn(`[ContainerOperations] 端口 ${port} 已被系统进程占用`)
            return false
          }
        } else {
          // Linux/Mac: 使用 ss 或 netstat 检查
          try {
            const { stdout } = await execAsync(`ss -tln | grep ":${port} " || netstat -tln | grep ":${port} "`)
            if (stdout.trim()) {
              console.warn(`[ContainerOperations] 端口 ${port} 已被系统进程占用`)
              return false
            }
          } catch {
            // 命令失败，假设端口可用
          }
        }
      } catch {
        // 命令失败，继续
      }
      
      return true
    } catch (error) {
      console.error(`[ContainerOperations] 检查端口 ${port} 状态时出错:`, error)
      // 出错时保守处理，假设端口不可用
      return false
    }
  }

  /**
   * 根据ID查找容器实例
   */
  findContainerById(containerId: string, userMappings: Map<string, any>): ContainerInstance | undefined {
    // 在用户映射中查找
    for (const mapping of userMappings.values()) {
      if (mapping.container.containerId === containerId) {
        return mapping.container
      }
    }

    return undefined
  }

  /**
   * 通过名称获取容器信息
   */
  async getContainerInfoByName(name: string): Promise<ContainerInstance | null> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.Id}} {{.State.Status}}' ${name}`
      )
      const [id, status] = stdout.trim().split(' ')

      // 获取端口映射
      const { stdout: portOutput } = await execAsync(
        `docker port ${name} 3000`
      )
      const portMatch = portOutput.match(/:(\d+)/)
      const port = portMatch ? parseInt(portMatch[1], 10) : 0

      return {
        containerId: id,
        containerName: name,
        hostPort: port,
        status: status as ContainerInstance['status'],
        createdAt: new Date(),
        lastActivityAt: new Date()
      }

    } catch {
      return null
    }
  }

  /**
   * 检查容器是否存在
   */
  async containerExists(name: string): Promise<boolean> {
    try {
      await execAsync(`docker inspect ${name}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * 确保路径具有正确的权限（跨平台兼容）
   * @param targetPath 目标路径
   */
  async ensurePathPermissions(targetPath: string): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 icacls 设置权限
        // 允许 Everyone 完全控制（生产环境应限制为特定用户）
        await execAsync(`icacls "${targetPath}" /grant Everyone:F /T`)
        console.log(`[ContainerOperations] 已设置目录权限 (Windows): ${targetPath}`)
      } else {
        // Linux/Mac: 使用 chmod
        await execAsync(`chmod 755 "${targetPath}"`)
        console.log(`[ContainerOperations] 已设置目录权限: ${targetPath}`)
      }
    } catch (error) {
      console.warn(`[ContainerOperations] 设置目录权限失败（非致命）: ${targetPath}`, error)
    }
  }

  /**
   * 执行 Docker exec 命令进行健康检查
   */
  async checkContainerHealthViaExec(containerId: string): Promise<boolean> {
    try {
      const workerPort = getWorkerInternalPort()
      const healthUrl = `http://localhost:${workerPort}/internal/health`
      // 使用 --connect-timeout 和 --max-time 避免curl挂起
      const cmd = `docker exec ${containerId} curl -s --connect-timeout 3 --max-time 5 -o /dev/null -w "%{http_code}" ${healthUrl} 2>/dev/null || echo "000"`

      const { stdout: healthOutput, stderr: healthError } = await execAsync(cmd)
      const statusCode = parseInt(healthOutput.trim(), 10)

      // 只要HTTP服务器能够响应（状态码小于500），就认为容器健康
      const isHealthy = statusCode > 0 && statusCode < 500

      if (!isHealthy) {
        console.warn(`[ContainerOperations] 容器 ${containerId} 健康检查失败: statusCode=${statusCode}, url=${healthUrl}, stderr=${healthError || '无'}`)
      }

      return isHealthy
    } catch (execError) {
      // Docker exec失败，容器可能还在启动中
      console.warn(`[ContainerOperations] 容器 ${containerId} 健康检查Docker exec失败:`, execError)
      return false
    }
  }

  /**
   * 检查容器运行状态
   */
  async checkContainerRunning(containerId: string): Promise<boolean> {
    try {
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect --format='{{.State.Running}}' ${containerId}`
      )
      return inspectOutput.trim() === 'true'
    } catch {
      return false
    }
  }

  /**
   * 检查容器是否存在于 Docker 中
   */
  async inspectContainer(containerId: string): Promise<boolean> {
    try {
      await execAsync(`docker inspect ${containerId}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取容器的IP地址（在Docker网络中）
   */
  async getContainerIp(containerId: string, networkName: string = 'claw-web_worker-network'): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{range .NetworkSettings.Networks}}{{if eq "${networkName}" .NetworkID}}{{.IPAddress}}{{end}}{{end}}' ${containerId}`
      )
      const ip = stdout.trim()
      return ip || null
    } catch {
      return null
    }
  }
}

/**
 * 上下文隔离执行模块
 * 
 * 功能：
 * - Worktree 隔离执行
 * - Remote 远程隔离模式
 * - 上下文边界控制
 * - 资源隔离管理
 */

import { spawn, ChildProcess } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs/promises'
import * as path from 'path'

// ==================== 类型定义 ====================

/**
 * 隔离模式
 */
export enum IsolationMode {
  /** Git Worktree 隔离 */
  WORKTREE = 'worktree',
  /** 远程隔离 */
  REMOTE = 'remote'
}

/**
 * 隔离状态
 */
export enum IsolationStatus {
  /** 初始化中 */
  INITIALIZING = 'initializing',
  /** 就绪 */
  READY = 'ready',
  /** 运行中 */
  RUNNING = 'running',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 已终止 */
  TERMINATED = 'terminated',
  /** 错误 */
  ERROR = 'error'
}

/**
 * 工作目录隔离配置
 */
export interface WorktreeConfig {
  /** 主仓库路径 */
  mainRepoPath: string
  /** 工作树名称 */
  worktreeName: string
  /** 工作树路径 */
  worktreePath?: string
  /** 分支名称 */
  branchName?: string
  /** 创建时使用的提交 */
  commit?: string
}

/**
 * 远程隔离配置
 */
export interface RemoteConfig {
  /** 远程类型 */
  type: 'ssh' | 'docker' | 'kubernetes' | 'serverless'
  /** 连接配置 */
  connection: {
    host?: string
    port?: number
    user?: string
    keyPath?: string
    password?: string
  }
  /** 容器/Pod 配置 */
  container?: {
    image: string
    volumes?: Array<{ host: string; container: string }>
    environment?: Record<string, string>
  }
  /** 执行超时 */
  timeout?: number
}

/**
 * 隔离上下文配置
 */
export interface IsolationContextConfig {
  /** 隔离 ID */
  isolationId: string
  /** 隔离模式 */
  mode: IsolationMode
  /** 隔离名称 */
  name: string
  /** 描述 */
  description?: string
  /** 工作目录 */
  workingDirectory: string
  /** 环境变量 */
  environment?: Record<string, string>
  /** 最大内存 (MB) */
  maxMemory?: number
  /** 最大 CPU (%) */
  maxCpu?: number
  /** 执行超时 (毫秒) */
  timeout?: number
  /** 清理策略 */
  cleanupPolicy: 'immediate' | 'delayed' | 'manual'
  /** Worktree 配置 */
  worktree?: WorktreeConfig
  /** 远程配置 */
  remote?: RemoteConfig
}

/**
 * 隔离执行结果
 */
export interface IsolationResult {
  /** 是否成功 */
  success: boolean
  /** 隔离 ID */
  isolationId: string
  /** 输出 */
  output?: string
  /** 错误 */
  error?: string
  /** 退出码 */
  exitCode?: number
  /** 执行时长 */
  duration: number
}

/**
 * 隔离执行请求
 */
export interface IsolationExecutionRequest {
  /** 隔离 ID */
  isolationId: string
  /** 命令 */
  command: string
  /** 参数 */
  args?: string[]
  /** 工作目录 */
  cwd?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 超时 */
  timeout?: number
}

/**
 * 隔离上下文信息
 */
export interface IsolationContextInfo {
  /** 隔离 ID */
  isolationId: string
  /** 隔离名称 */
  name: string
  /** 模式 */
  mode: IsolationMode
  /** 状态 */
  status: IsolationStatus
  /** 工作目录 */
  workingDirectory: string
  /** 创建时间 */
  createdAt: Date
  /** 最后活动时间 */
  lastActivity: Date
  /** 执行次数 */
  executionCount: number
  /** 总执行时长 */
  totalDuration: number
}

// ==================== Git Worktree 隔离 ====================

/**
 * Git Worktree 管理器
 */
export class WorktreeIsolation {
  private worktrees: Map<string, {
    config: WorktreeConfig
    process?: ChildProcess
    status: IsolationStatus
    createdAt: Date
    lastActivity: Date
  }> = new Map()

  /**
   * 创建 Worktree
   */
  async create(config: WorktreeConfig): Promise<string> {
    const worktreeName = config.worktreeName
    const worktreePath = config.worktreePath || path.join(config.mainRepoPath, '../', worktreeName)

    // 检查主仓库是否存在
    try {
      await fs.access(path.join(config.mainRepoPath, '.git'))
    } catch {
      throw new Error(`主仓库不存在: ${config.mainRepoPath}`)
    }

    // 检查 worktree 是否已存在
    if (this.worktrees.has(worktreeName)) {
      const existing = this.worktrees.get(worktreeName)!
      if (existing.status !== IsolationStatus.TERMINATED) {
        throw new Error(`Worktree 已存在: ${worktreeName}`)
      }
    }

    // 构建 git worktree add 命令
    const args = ['worktree', 'add']
    
    if (config.branchName) {
      args.push('-b', config.branchName)
    }
    
    args.push(worktreePath)
    
    if (config.commit) {
      args.push(config.commit)
    }

    try {
      await this.runGitCommand(config.mainRepoPath, args)
    } catch (error) {
      throw new Error(`创建 Worktree 失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 注册 worktree
    this.worktrees.set(worktreeName, {
      config: { ...config, worktreePath },
      status: IsolationStatus.READY,
      createdAt: new Date(),
      lastActivity: new Date()
    })

    console.log(`[WorktreeIsolation] 已创建 worktree: ${worktreeName} @ ${worktreePath}`)
    return worktreePath
  }

  /**
   * 删除 Worktree
   */
  async remove(worktreeName: string, force: boolean = false): Promise<void> {
    const worktree = this.worktrees.get(worktreeName)
    if (!worktree) {
      throw new Error(`Worktree 不存在: ${worktreeName}`)
    }

    // 先终止任何运行中的进程
    if (worktree.process && !worktree.process.killed) {
      worktree.process.kill()
    }

    try {
      // git worktree remove
      const args = ['worktree', 'remove', worktreeName]
      if (force) {
        args.push('--force')
      }
      await this.runGitCommand(worktree.config.mainRepoPath, args)
    } catch (error) {
      console.error(`[WorktreeIsolation] 删除 worktree 失败:`, error)
      throw error
    }

    this.worktrees.delete(worktreeName)
    console.log(`[WorktreeIsolation] 已删除 worktree: ${worktreeName}`)
  }

  /**
   * 列出所有 Worktree
   */
  list(): Array<{ name: string; path: string; branch: string; status: IsolationStatus }> {
    const result: Array<{ name: string; path: string; branch: string; status: IsolationStatus }> = []

    for (const [name, worktree] of this.worktrees) {
      result.push({
        name,
        path: worktree.config.worktreePath || '',
        branch: worktree.config.branchName || '',
        status: worktree.status
      })
    }

    return result
  }

  /**
   * 获取 Worktree 路径
   */
  getPath(worktreeName: string): string | undefined {
    return this.worktrees.get(worktreeName)?.config.worktreePath
  }

  /**
   * 获取 Worktree 状态
   */
  getStatus(worktreeName: string): IsolationStatus | undefined {
    return this.worktrees.get(worktreeName)?.status
  }

  /**
   * 在 Worktree 中执行命令
   */
  async execute(
    worktreeName: string,
    command: string,
    args: string[] = [],
    options: {
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    } = {}
  ): Promise<IsolationResult> {
    const worktree = this.worktrees.get(worktreeName)
    if (!worktree) {
      return {
        success: false,
        isolationId: worktreeName,
        error: `Worktree 不存在: ${worktreeName}`,
        duration: 0
      }
    }

    if (worktree.status === IsolationStatus.TERMINATED) {
      return {
        success: false,
        isolationId: worktreeName,
        error: `Worktree 已终止: ${worktreeName}`,
        duration: 0
      }
    }

    const cwd = options.cwd || worktree.config.worktreePath
    const startTime = Date.now()

    try {
      const result = await this.runCommand(command, args, {
        cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeout
      })

      worktree.lastActivity = new Date()

      return {
        success: result.exitCode === 0,
        isolationId: worktreeName,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        isolationId: worktreeName,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 运行 Git 命令
   */
  private async runGitCommand(repoPath: string, args: string[]): Promise<string> {
    const result = await this.runCommand('git', args, { cwd: repoPath })
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Git 命令失败')
    }
    return result.stdout
  }

  /**
   * 运行命令
   */
  private runCommand(
    command: string,
    args: string[],
    options: {
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const timer = options.timeout
        ? setTimeout(() => {
            if (!settled) {
              settled = true
              proc.kill()
              resolve({ stdout, stderr, exitCode: -1 })
            }
          }, options.timeout)
        : null

      proc.stdout?.on('data', (data) => { stdout += data.toString() })
      proc.stderr?.on('data', (data) => { stderr += data.toString() })

      proc.on('close', (code) => {
        if (!settled) {
          settled = true
          if (timer) clearTimeout(timer)
          resolve({ stdout, stderr, exitCode: code || 0 })
        }
      })

      proc.on('error', (error) => {
        if (!settled) {
          settled = true
          if (timer) clearTimeout(timer)
          stderr += error.message
          resolve({ stdout, stderr, exitCode: -1 })
        }
      })
    })
  }
}

// ==================== 远程隔离 ====================

/**
 * 远程隔离执行器
 */
export class RemoteIsolation {
  private connections: Map<string, {
    config: RemoteConfig
    status: IsolationStatus
    process?: ChildProcess
    createdAt: Date
    lastActivity: Date
  }> = new Map()

  /**
   * 建立远程连接
   */
  async connect(id: string, config: RemoteConfig): Promise<void> {
    if (this.connections.has(id)) {
      throw new Error(`连接已存在: ${id}`)
    }

    // 验证配置
    this.validateConfig(config)

    // 建立连接
    switch (config.type) {
      case 'ssh':
        await this.establishSSHConnection(id, config)
        break
      case 'docker':
        await this.establishDockerConnection(id, config)
        break
      default:
        throw new Error(`不支持的远程类型: ${config.type}`)
    }

    this.connections.set(id, {
      config,
      status: IsolationStatus.READY,
      createdAt: new Date(),
      lastActivity: new Date()
    })

    console.log(`[RemoteIsolation] 已建立远程连接: ${id}`)
  }

  /**
   * 断开远程连接
   */
  async disconnect(id: string): Promise<void> {
    const connection = this.connections.get(id)
    if (!connection) {
      throw new Error(`连接不存在: ${id}`)
    }

    // 终止进程
    if (connection.process && !connection.process.killed) {
      connection.process.kill()
    }

    this.connections.delete(id)
    console.log(`[RemoteIsolation] 已断开远程连接: ${id}`)
  }

  /**
   * 在远程执行命令
   */
  async execute(
    id: string,
    command: string,
    options: {
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    } = {}
  ): Promise<IsolationResult> {
    const connection = this.connections.get(id)
    if (!connection) {
      return {
        success: false,
        isolationId: id,
        error: `连接不存在: ${id}`,
        duration: 0
      }
    }

    if (connection.status !== IsolationStatus.READY) {
      return {
        success: false,
        isolationId: id,
        error: `连接未就绪: ${connection.status}`,
        duration: 0
      }
    }

    const startTime = Date.now()
    connection.status = IsolationStatus.RUNNING

    try {
      let result: { stdout: string; stderr: string; exitCode: number }

      switch (connection.config.type) {
        case 'ssh':
          result = await this.executeSSH(id, command, options)
          break
        case 'docker':
          result = await this.executeDocker(id, command, options)
          break
        default:
          throw new Error(`不支持的远程类型: ${connection.config.type}`)
      }

      connection.lastActivity = new Date()
      connection.status = IsolationStatus.READY

      return {
        success: result.exitCode === 0,
        isolationId: id,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime
      }
    } catch (error) {
      connection.status = IsolationStatus.ERROR
      return {
        success: false,
        isolationId: id,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 获取连接状态
   */
  getStatus(id: string): IsolationStatus | undefined {
    return this.connections.get(id)?.status
  }

  /**
   * 验证配置
   */
  private validateConfig(config: RemoteConfig): void {
    if (!config.type) {
      throw new Error('远程类型是必需的')
    }

    if (!config.connection) {
      throw new Error('连接配置是必需的')
    }

    if (config.type === 'ssh' && !config.connection.host) {
      throw new Error('SSH 连接需要指定 host')
    }

    if (config.type === 'docker' && !config.container?.image) {
      throw new Error('Docker 连接需要指定镜像')
    }
  }

  /**
   * 建立 SSH 连接
   */
  private async establishSSHConnection(id: string, config: RemoteConfig): Promise<void> {
    const { host, user, port } = config.connection
    console.log(`[RemoteIsolation] 建立 SSH 连接: ${user}@${host}:${port || 22}`)
    // 实际实现应该验证 SSH 连接
  }

  /**
   * 建立 Docker 连接
   */
  private async establishDockerConnection(id: string, config: RemoteConfig): Promise<void> {
    const { image } = config.container!
    console.log(`[RemoteIsolation] 建立 Docker 连接: ${image}`)
    // 实际实现应该验证 Docker 连接
  }

  /**
   * 通过 SSH 执行命令
   */
  private executeSSH(
    id: string,
    command: string,
    options: { cwd?: string; env?: Record<string, string>; timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const config = this.connections.get(id)!.config
    const { host, user, port, keyPath } = config.connection

    const sshArgs = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null'
    ]

    if (keyPath) {
      sshArgs.push('-i', keyPath)
    }

    if (port) {
      sshArgs.push('-p', port.toString())
    }

    const target = user ? `${user}@${host}` : host
    const fullCommand = options.cwd 
      ? `cd ${options.cwd} && ${command}`
      : command

    sshArgs.push(target, fullCommand)

    return this.runCommand('ssh', sshArgs, {
      timeout: options.timeout
    })
  }

  /**
   * 通过 Docker 执行命令
   */
  private executeDocker(
    id: string,
    command: string,
    options: { cwd?: string; env?: Record<string, string>; timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const config = this.connections.get(id)!.config
    const { image, volumes, environment } = config.container!

    const dockerArgs = ['exec']

    // 添加环境变量
    if (environment) {
      for (const [key, value] of Object.entries(environment)) {
        dockerArgs.push('-e', `${key}=${value}`)
      }
    }

    // 添加工作目录
    if (options.cwd) {
      dockerArgs.push('-w', options.cwd)
    }

    // 添加容器名称/ID (使用 isolation id)
    dockerArgs.push(id)

    // 添加命令
    dockerArgs.push('sh', '-c', command)

    return this.runCommand('docker', dockerArgs, {
      timeout: options.timeout
    })
  }

  /**
   * 运行命令
   */
  private runCommand(
    command: string,
    args: string[],
    options: { timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: true
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const timer = options.timeout
        ? setTimeout(() => {
            if (!settled) {
              settled = true
              proc.kill()
              resolve({ stdout, stderr, exitCode: -1 })
            }
          }, options.timeout)
        : null

      proc.stdout?.on('data', (data) => { stdout += data.toString() })
      proc.stderr?.on('data', (data) => { stderr += data.toString() })

      proc.on('close', (code) => {
        if (!settled) {
          settled = true
          if (timer) clearTimeout(timer)
          resolve({ stdout, stderr, exitCode: code || 0 })
        }
      })

      proc.on('error', (error) => {
        if (!settled) {
          settled = true
          if (timer) clearTimeout(timer)
          stderr += error.message
          resolve({ stdout, stderr, exitCode: -1 })
        }
      })
    })
  }
}

// ==================== 隔离上下文管理器 ====================

/**
 * 隔离上下文管理器
 */
export class IsolationContextManager {
  private worktreeIsolation: WorktreeIsolation
  private remoteIsolation: RemoteIsolation
  private contexts: Map<string, {
    config: IsolationContextConfig
    status: IsolationStatus
    executionCount: number
    totalDuration: number
    createdAt: Date
    lastActivity: Date
  }> = new Map()

  constructor() {
    this.worktreeIsolation = new WorktreeIsolation()
    this.remoteIsolation = new RemoteIsolation()
  }

  /**
   * 创建隔离上下文
   */
  async create(config: IsolationContextConfig): Promise<string> {
    const isolationId = config.isolationId || `isolation_${uuidv4().slice(0, 8)}`

    if (this.contexts.has(isolationId)) {
      throw new Error(`隔离上下文已存在: ${isolationId}`)
    }

    let workingDirectory = config.workingDirectory

    // 根据模式初始化
    if (config.mode === IsolationMode.WORKTREE && config.worktree) {
      workingDirectory = await this.worktreeIsolation.create({
        ...config.worktree,
        worktreeName: config.worktree.worktreeName || isolationId
      })
    } else if (config.mode === IsolationMode.REMOTE && config.remote) {
      await this.remoteIsolation.connect(isolationId, config.remote)
    }

    const finalConfig: IsolationContextConfig = {
      ...config,
      isolationId,
      workingDirectory
    }

    this.contexts.set(isolationId, {
      config: finalConfig,
      status: IsolationStatus.INITIALIZING,
      executionCount: 0,
      totalDuration: 0,
      createdAt: new Date(),
      lastActivity: new Date()
    })

    // 更新状态为就绪
    const context = this.contexts.get(isolationId)!
    context.status = IsolationStatus.READY

    console.log(`[IsolationContextManager] 已创建隔离上下文: ${isolationId} (${config.mode})`)
    return isolationId
  }

  /**
   * 获取隔离上下文信息
   */
  getContext(isolationId: string): IsolationContextInfo | undefined {
    const context = this.contexts.get(isolationId)
    if (!context) return undefined

    return {
      isolationId: context.config.isolationId,
      name: context.config.name,
      mode: context.config.mode,
      status: context.status,
      workingDirectory: context.config.workingDirectory,
      createdAt: context.createdAt,
      lastActivity: context.lastActivity,
      executionCount: context.executionCount,
      totalDuration: context.totalDuration
    }
  }

  /**
   * 获取 Worktree 路径（辅助方法）
   */
  getWorktreePath(isolationId: string): string | undefined {
    const context = this.contexts.get(isolationId)
    if (!context || context.config.mode !== IsolationMode.WORKTREE) {
      return undefined
    }
    
    const worktreeName = context.config.worktree?.worktreeName || isolationId
    return this.worktreeIsolation.getPath(worktreeName)
  }

  /**
   * 执行命令
   */
  async execute(request: IsolationExecutionRequest): Promise<IsolationResult> {
    const context = this.contexts.get(request.isolationId)
    if (!context) {
      return {
        success: false,
        isolationId: request.isolationId,
        error: `隔离上下文不存在: ${request.isolationId}`,
        duration: 0
      }
    }

    let result: IsolationResult

    if (context.config.mode === IsolationMode.WORKTREE) {
      result = await this.worktreeIsolation.execute(
        context.config.worktree?.worktreeName || request.isolationId,
        request.command,
        request.args,
        {
          cwd: request.cwd || context.config.workingDirectory,
          env: { ...context.config.environment, ...request.env },
          timeout: request.timeout || context.config.timeout
        }
      )
    } else {
      result = await this.remoteIsolation.execute(
        request.isolationId,
        request.command,
        {
          cwd: request.cwd || context.config.workingDirectory,
          env: { ...context.config.environment, ...request.env },
          timeout: request.timeout || context.config.timeout
        }
      )
    }

    // 更新统计
    context.executionCount++
    context.totalDuration += result.duration
    context.lastActivity = new Date()

    return result
  }

  /**
   * 销毁隔离上下文
   */
  async destroy(isolationId: string): Promise<void> {
    const context = this.contexts.get(isolationId)
    if (!context) {
      throw new Error(`隔离上下文不存在: ${isolationId}`)
    }

    // 根据清理策略处理
    if (context.config.cleanupPolicy === 'immediate') {
      await this.cleanup(isolationId)
    } else if (context.config.cleanupPolicy === 'delayed') {
      // 延迟清理
      setTimeout(async () => {
        try {
          await this.cleanup(isolationId)
        } catch (error) {
          console.error(`[IsolationContextManager] 延迟清理失败:`, error)
        }
      }, 60000) // 1分钟后清理
    }

    context.status = IsolationStatus.TERMINATED
    console.log(`[IsolationContextManager] 已销毁隔离上下文: ${isolationId}`)
  }

  /**
   * 清理资源
   */
  private async cleanup(isolationId: string): Promise<void> {
    const context = this.contexts.get(isolationId)
    if (!context) return

    if (context.config.mode === IsolationMode.WORKTREE && context.config.worktree) {
      try {
        await this.worktreeIsolation.remove(
          context.config.worktree.worktreeName || isolationId,
          true
        )
      } catch (error) {
        console.error(`[IsolationContextManager] 清理 worktree 失败:`, error)
      }
    } else if (context.config.mode === IsolationMode.REMOTE) {
      try {
        await this.remoteIsolation.disconnect(isolationId)
      } catch (error) {
        console.error(`[IsolationContextManager] 断开远程连接失败:`, error)
      }
    }

    this.contexts.delete(isolationId)
  }

  /**
   * 获取所有隔离上下文
   */
  listContexts(): IsolationContextInfo[] {
    return Array.from(this.contexts.keys())
      .map(id => this.getContext(id))
      .filter((c): c is IsolationContextInfo => c !== undefined)
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalContexts: number
    byMode: Record<string, number>
    byStatus: Record<string, number>
    totalExecutions: number
  } {
    const stats = {
      totalContexts: this.contexts.size,
      byMode: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalExecutions: 0
    }

    for (const context of this.contexts.values()) {
      const mode = context.config.mode
      const status = context.status

      stats.byMode[mode] = (stats.byMode[mode] || 0) + 1
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1
      stats.totalExecutions += context.executionCount
    }

    return stats
  }
}

// ==================== 全局实例 ====================

let isolationManager: IsolationContextManager | null = null

export function getIsolationManager(): IsolationContextManager {
  if (!isolationManager) {
    isolationManager = new IsolationContextManager()
  }
  return isolationManager
}

// ==================== 导出 ====================

export type {
  WorktreeConfig,
  RemoteConfig,
  IsolationContextConfig,
  IsolationResult,
  IsolationExecutionRequest,
  IsolationContextInfo
}

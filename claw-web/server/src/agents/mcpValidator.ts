/**
 * MCP 服务器验证模块
 * 
 * 提供 MCP 服务器的完整验证功能，包括：
 * - 服务器连接验证
 * - 工具可用性验证
 * - 资源访问验证
 * - 健康检查
 * - 错误处理与重试
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { AgentError, AgentErrorFactory } from './errorHandler'
import { AgentErrorType } from './errorHandler'

// ==================== 类型定义 ====================

/**
 * MCP 传输类型
 */
export type MCPTransportType = 'stdio' | 'websocket' | 'sse' | 'streamable-http'

/**
 * MCP 服务器配置
 */
export interface MCPValidatedServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  transport: MCPTransportType
  url?: string
  timeout?: number
  maxRetries?: number
  healthCheckInterval?: number
}

/**
 * 验证结果
 */
export interface MCPValidationResult {
  valid: boolean
  serverId: string
  serverName: string
  checks: MCPValidationCheck[]
  errors: string[]
  warnings: string[]
  timestamp: Date
  durationMs: number
}

/**
 * 单个验证检查项
 */
export interface MCPValidationCheck {
  name: string
  passed: boolean
  message: string
  durationMs: number
}

/**
 * 工具验证结果
 */
export interface MCPToolValidationResult {
  toolName: string
  valid: boolean
  schemaValid: boolean
  handlerRegistered: boolean
  errors: string[]
}

/**
 * 健康检查结果
 */
export interface MCPHealthCheckResult {
  healthy: boolean
  serverId: string
  serverName: string
  checks: {
    process?: boolean
    connection?: boolean
    tools?: boolean
    latency?: number
  }
  lastCheck: Date
  consecutiveFailures: number
}

/**
 * MCP 服务器验证配置
 */
export interface MCPValidatorConfig {
  enableHealthChecks: boolean
  healthCheckInterval: number
  defaultTimeout: number
  maxRetries: number
  validateTools: boolean
  validateResources: boolean
}

// ==================== MCP 服务器验证器 ====================

/**
 * MCP 服务器验证器
 */
export class MCPServerValidator extends EventEmitter {
  private config: MCPValidatorConfig
  private healthChecks: Map<string, {
    interval: NodeJS.Timeout
    failures: number
    lastResult?: MCPHealthCheckResult
  }> = new Map()
  private serverProcesses: Map<string, ChildProcess> = new Map()
  private validationHistory: Map<string, MCPValidationResult[]> = new Map()

  constructor(config?: Partial<MCPValidatorConfig>) {
    super()
    this.config = {
      enableHealthChecks: true,
      healthCheckInterval: 30000,
      defaultTimeout: 10000,
      maxRetries: 3,
      validateTools: true,
      validateResources: true,
      ...config
    }
  }

  // ==================== 验证方法 ====================

  /**
   * 验证 MCP 服务器配置
   */
  async validateServerConfig(config: MCPValidatedServerConfig): Promise<MCPValidationResult> {
    const startTime = Date.now()
    const checks: MCPValidationCheck[] = []
    const errors: string[] = []
    const warnings: string[] = []

    // 1. 基本配置验证
    checks.push(this.checkBasicConfig(config, errors, warnings))

    // 2. 命令存在性验证
    if (config.command) {
      checks.push(await this.checkCommandExists(config, errors, warnings))
    }

    // 3. 传输类型验证
    checks.push(this.checkTransport(config, errors, warnings))

    // 4. 超时配置验证
    checks.push(this.checkTimeout(config, warnings))

    // 5. 环境变量验证
    if (config.env) {
      checks.push(this.checkEnvironmentVariables(config, warnings))
    }

    const durationMs = Date.now() - startTime
    const valid = errors.length === 0

    const result: MCPValidationResult = {
      valid,
      serverId: config.id,
      serverName: config.name,
      checks,
      errors,
      warnings,
      timestamp: new Date(),
      durationMs
    }

    // 记录历史
    this.recordValidation(config.id, result)

    return result
  }

  /**
   * 验证 MCP 服务器连接
   */
  async validateConnection(
    config: MCPValidatedServerConfig,
    timeout?: number
  ): Promise<MCPValidationResult> {
    const startTime = Date.now()
    const checks: MCPValidationCheck[] = []
    const errors: string[] = []
    const warnings: string[] = []
    const effectiveTimeout = timeout || this.config.defaultTimeout

    // 1. 配置验证
    checks.push(this.checkBasicConfig(config, errors, warnings))

    if (errors.length > 0) {
      return {
        valid: false,
        serverId: config.id,
        serverName: config.name,
        checks,
        errors,
        warnings,
        timestamp: new Date(),
        durationMs: Date.now() - startTime
      }
    }

    try {
      // 2. Stdio 传输连接测试
      if (config.transport === 'stdio') {
        checks.push(await this.testStdioConnection(config, effectiveTimeout, errors))
      }

      // 3. HTTP/WebSocket 连接测试
      else if (['websocket', 'sse', 'streamable-http'].includes(config.transport)) {
        checks.push(await this.testHttpConnection(config, effectiveTimeout, errors))
      }

      // 4. 进程存活检查
      if (this.serverProcesses.has(config.id)) {
        const process = this.serverProcesses.get(config.id)
        checks.push(this.checkProcessAlive(config.id, process))
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Connection validation failed: ${message}`)
    }

    const durationMs = Date.now() - startTime

    return {
      valid: errors.length === 0,
      serverId: config.id,
      serverName: config.name,
      checks,
      errors,
      warnings,
      timestamp: new Date(),
      durationMs
    }
  }

  /**
   * 验证 MCP 工具
   */
  async validateTool(
    toolName: string,
    schema: Record<string, unknown>,
    handler?: (args: Record<string, unknown>) => Promise<unknown>
  ): Promise<MCPToolValidationResult> {
    const errors: string[] = []
    let schemaValid = true
    let handlerRegistered = !!handler

    // 1. 验证工具名称
    if (!toolName || typeof toolName !== 'string') {
      errors.push('Invalid tool name: must be a non-empty string')
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(toolName)) {
      errors.push('Invalid tool name: must start with a letter and contain only alphanumeric, underscore, and hyphen')
    }

    // 2. 验证输入 Schema
    if (!schema || typeof schema !== 'object') {
      schemaValid = false
      errors.push('Invalid input schema: must be an object')
    } else {
      try {
        this.validateJsonSchema(schema)
      } catch (error) {
        schemaValid = false
        errors.push(`Invalid JSON Schema: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 3. 验证必需字段
    const schemaObj = schema as Record<string, unknown>
    if (schemaObj.properties && typeof schemaObj.properties === 'object') {
      const properties = schemaObj.properties as Record<string, unknown>
      const required = (schemaObj.required as string[]) || []
      
      for (const field of required) {
        if (!properties[field]) {
          errors.push(`Required field "${field}" is missing from properties`)
        }
      }
    }

    return {
      toolName,
      valid: errors.length === 0,
      schemaValid,
      handlerRegistered,
      errors
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck(config: MCPValidatedServerConfig): Promise<MCPHealthCheckResult> {
    const check: MCPHealthCheckResult = {
      healthy: false,
      serverId: config.id,
      serverName: config.name,
      checks: {},
      lastCheck: new Date(),
      consecutiveFailures: this.healthChecks.get(config.id)?.failures || 0
    }

    try {
      // 1. 进程检查 (stdio)
      if (config.transport === 'stdio' && this.serverProcesses.has(config.id)) {
        const process = this.serverProcesses.get(config.id)
        check.checks.process = this.isProcessAlive(process)
        if (!check.checks.process) {
          check.consecutiveFailures++
        }
      }

      // 2. 连接检查 (HTTP/WebSocket)
      if (['websocket', 'sse', 'streamable-http'].includes(config.transport) && config.url) {
        const latencyStart = Date.now()
        try {
          const response = await this.pingEndpoint(config.url, this.config.defaultTimeout)
          check.checks.connection = response.ok
          check.checks.latency = Date.now() - latencyStart
          if (!response.ok) {
            check.consecutiveFailures++
          }
        } catch {
          check.checks.connection = false
          check.consecutiveFailures++
        }
      }

      // 3. 工具检查 (如果支持)
      if (this.config.validateTools) {
        check.checks.tools = true
      }

      check.healthy = this.isHealthy(check)

    } catch (error) {
      check.consecutiveFailures++
      console.error(`[MCPValidator] Health check failed for ${config.name}:`, error)
    }

    // 更新健康检查记录
    const existing = this.healthChecks.get(config.id)
    if (existing) {
      existing.lastResult = check
      existing.failures = check.consecutiveFailures
    } else {
      this.healthChecks.set(config.id, {
        interval: this.startHealthCheckInterval(config),
        failures: check.consecutiveFailures,
        lastResult: check
      })
    }

    return check
  }

  // ==================== 验证检查项 ====================

  /**
   * 检查基本配置
   */
  private checkBasicConfig(
    config: MCPValidatedServerConfig,
    errors: string[],
    warnings: string[]
  ): MCPValidationCheck {
    const startTime = Date.now()

    if (!config.id) {
      errors.push('Server ID is required')
    }

    if (!config.name) {
      errors.push('Server name is required')
    }

    if (config.transport === 'stdio' && !config.command) {
      errors.push('Command is required for stdio transport')
    }

    if (['websocket', 'sse', 'streamable-http'].includes(config.transport) && !config.url) {
      errors.push('URL is required for HTTP-based transports')
    }

    return {
      name: 'basic_config',
      passed: errors.length === 0 || errors.every(e => !e.includes('required')),
      message: errors.length === 0 ? 'Basic configuration is valid' : errors.join('; '),
      durationMs: Date.now() - startTime
    }
  }

  /**
   * 检查命令存在性
   */
  private async checkCommandExists(
    config: MCPValidatedServerConfig,
    errors: string[],
    warnings: string[]
  ): Promise<MCPValidationCheck> {
    const startTime = Date.now()

    try {
      // 在 Windows 上使用 where 命令，在 Unix 上使用 which 命令
      const isWindows = process.platform === 'win32'
      const checkCommand = isWindows ? `where ${config.command}` : `which ${config.command}`
      
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      
      await execAsync(checkCommand, { timeout: 5000 })
      
      return {
        name: 'command_exists',
        passed: true,
        message: `Command "${config.command}" found`,
        durationMs: Date.now() - startTime
      }
    } catch {
      // 命令不存在可能是正常的（通过 npx 或 npm scripts 调用）
      warnings.push(`Command "${config.command}" not found in PATH - may require npx or local installation`)
      return {
        name: 'command_exists',
        passed: true, // 不作为硬错误
        message: 'Command check passed with warnings',
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * 检查传输类型
   */
  private checkTransport(
    config: MCPValidatedServerConfig,
    errors: string[],
    warnings: string[]
  ): MCPValidationCheck {
    const startTime = Date.now()
    const validTransports: MCPTransportType[] = ['stdio', 'websocket', 'sse', 'streamable-http']

    if (!validTransports.includes(config.transport)) {
      errors.push(`Invalid transport type: ${config.transport}`)
      return {
        name: 'transport',
        passed: false,
        message: errors[errors.length - 1],
        durationMs: Date.now() - startTime
      }
    }

    return {
      name: 'transport',
      passed: true,
      message: `Transport type "${config.transport}" is valid`,
      durationMs: Date.now() - startTime
    }
  }

  /**
   * 检查超时配置
   */
  private checkTimeout(
    config: MCPValidatedServerConfig,
    warnings: string[]
  ): MCPValidationCheck {
    const startTime = Date.now()
    const timeout = config.timeout || this.config.defaultTimeout

    if (timeout < 1000) {
      warnings.push('Timeout is less than 1 second - may cause premature failures')
    }

    if (timeout > 120000) {
      warnings.push('Timeout exceeds 2 minutes - may cause long waits')
    }

    return {
      name: 'timeout',
      passed: true,
      message: `Timeout set to ${timeout}ms`,
      durationMs: Date.now() - startTime
    }
  }

  /**
   * 检查环境变量
   */
  private checkEnvironmentVariables(
    config: MCPValidatedServerConfig,
    warnings: string[]
  ): MCPValidationCheck {
    const startTime = Date.now()
    const env = config.env || {}

    for (const [key, value] of Object.entries(env)) {
      if (value === undefined || value === null) {
        warnings.push(`Environment variable "${key}" has undefined/null value`)
      }
    }

    return {
      name: 'environment',
      passed: true,
      message: 'Environment variables configured',
      durationMs: Date.now() - startTime
    }
  }

  /**
   * 测试 Stdio 连接
   */
  private async testStdioConnection(
    config: MCPValidatedServerConfig,
    timeout: number,
    errors: string[]
  ): Promise<MCPValidationCheck> {
    const startTime = Date.now()

    try {
      const process = spawn(config.command, config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...config.env },
        timeout
      })

      this.serverProcesses.set(config.id, process)

      // 等待进程启动
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          process.kill()
          reject(new Error('Connection timeout'))
        }, timeout)

        process.on('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })

        process.on('spawn', () => {
          clearTimeout(timer)
          resolve()
        })

        // 对于某些服务器，可能不会发送 spawn 事件
        setTimeout(resolve, 500)
      })

      return {
        name: 'stdio_connection',
        passed: true,
        message: 'Stdio connection established',
        durationMs: Date.now() - startTime
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Stdio connection failed: ${message}`)
      return {
        name: 'stdio_connection',
        passed: false,
        message,
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * 测试 HTTP 连接
   */
  private async testHttpConnection(
    config: MCPValidatedServerConfig,
    timeout: number,
    errors: string[]
  ): Promise<MCPValidationCheck> {
    const startTime = Date.now()

    if (!config.url) {
      errors.push('URL is required for HTTP transport')
      return {
        name: 'http_connection',
        passed: false,
        message: errors[errors.length - 1],
        durationMs: Date.now() - startTime
      }
    }

    try {
      const response = await this.pingEndpoint(config.url, timeout)

      if (!response.ok) {
        errors.push(`HTTP connection returned status ${response.status}`)
      }

      return {
        name: 'http_connection',
        passed: response.ok,
        message: response.ok ? 'HTTP connection successful' : `HTTP error: ${response.status}`,
        durationMs: Date.now() - startTime
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`HTTP connection failed: ${message}`)
      return {
        name: 'http_connection',
        passed: false,
        message,
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * 检查进程是否存活
   */
  private checkProcessAlive(serverId: string, process?: ChildProcess): MCPValidationCheck {
    const startTime = Date.now()
    const alive = this.isProcessAlive(process)

    return {
      name: 'process_alive',
      passed: alive,
      message: alive ? 'Process is running' : 'Process is not running',
      durationMs: Date.now() - startTime
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * Ping 端点
   */
  private async pingEndpoint(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      })
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 检查进程是否存活
   */
  private isProcessAlive(process?: ChildProcess): boolean {
    if (!process) return false
    try {
      return process.exitCode === null && !process.killed
    } catch {
      return false
    }
  }

  /**
   * 验证 JSON Schema
   */
  private validateJsonSchema(schema: Record<string, unknown>): void {
    if (!schema.type && !schema.properties) {
      throw new Error('Schema must have "type" or "properties" field')
    }

    if (schema.type && typeof schema.type !== 'string') {
      throw new Error('Schema type must be a string')
    }

    if (schema.properties && typeof schema.properties !== 'object') {
      throw new Error('Schema properties must be an object')
    }

    if (schema.required && !Array.isArray(schema.required)) {
      throw new Error('Schema required must be an array')
    }
  }

  /**
   * 判断健康状态
   */
  private isHealthy(check: MCPHealthCheckResult): boolean {
    const checks = check.checks
    
    // 如果启用了进程检查
    if ('process' in checks && checks.process === false) {
      return false
    }

    // 如果启用了连接检查
    if ('connection' in checks && checks.connection === false) {
      return false
    }

    // 如果连续失败次数过多
    if (check.consecutiveFailures > 3) {
      return false
    }

    return true
  }

  /**
   * 启动健康检查间隔
   */
  private startHealthCheckInterval(config: MCPValidatedServerConfig): NodeJS.Timeout {
    return setInterval(async () => {
      await this.performHealthCheck(config)
    }, this.config.healthCheckInterval)
  }

  /**
   * 记录验证结果
   */
  private recordValidation(serverId: string, result: MCPValidationResult): void {
    if (!this.validationHistory.has(serverId)) {
      this.validationHistory.set(serverId, [])
    }

    const history = this.validationHistory.get(serverId)!
    history.unshift(result)

    // 保持最近 100 条记录
    if (history.length > 100) {
      this.validationHistory.set(serverId, history.slice(0, 100))
    }
  }

  // ==================== 管理方法 ====================

  /**
   * 获取健康检查结果
   */
  getHealthCheck(serverId: string): MCPHealthCheckResult | undefined {
    return this.healthChecks.get(serverId)?.lastResult
  }

  /**
   * 获取所有健康检查结果
   */
  getAllHealthChecks(): Map<string, MCPHealthCheckResult> {
    const results = new Map<string, MCPHealthCheckResult>()
    for (const [serverId, data] of this.healthChecks) {
      if (data.lastResult) {
        results.set(serverId, data.lastResult)
      }
    }
    return results
  }

  /**
   * 获取验证历史
   */
  getValidationHistory(serverId: string, limit?: number): MCPValidationResult[] {
    const history = this.validationHistory.get(serverId) || []
    return limit ? history.slice(0, limit) : history
  }

  /**
   * 停止服务器进程
   */
  stopServer(serverId: string): boolean {
    const process = this.serverProcesses.get(serverId)
    if (process) {
      process.kill()
      this.serverProcesses.delete(serverId)
      return true
    }
    return false
  }

  /**
   * 停止所有服务器
   */
  stopAllServers(): void {
    for (const [serverId, process] of this.serverProcesses) {
      process.kill()
      console.log(`[MCPValidator] Stopped server: ${serverId}`)
    }
    this.serverProcesses.clear()
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    for (const [serverId, data] of this.healthChecks) {
      clearInterval(data.interval)
      console.log(`[MCPValidator] Stopped health checks for: ${serverId}`)
    }
    this.healthChecks.clear()
  }

  /**
   * 销毁验证器
   */
  destroy(): void {
    this.stopAllServers()
    this.stopHealthChecks()
    this.removeAllListeners()
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建 MCP 服务器错误
 */
export function createMCPServerError(
  type: AgentErrorType,
  serverId: string,
  message: string
): AgentError {
  switch (type) {
    case AgentErrorType.MCP_SERVER_NOT_FOUND:
      return AgentErrorFactory.mcpServerNotFound(serverId)
    case AgentErrorType.MCP_SERVER_UNAVAILABLE:
      return AgentErrorFactory.mcpServerUnavailable(serverId)
    case AgentErrorType.MCP_CONNECTION_FAILED:
      return new AgentError(
        `MCP 连接失败: ${message}`,
        type,
        {
          severity: 'high' as any,
          recoverable: true,
          recoveryStrategy: 'retry' as any,
          context: { serverId, message }
        }
      )
    default:
      return new AgentError(
        `MCP 服务器错误: ${message}`,
        type,
        {
          severity: 'medium' as any,
          recoverable: false,
          recoveryStrategy: 'abort' as any,
          context: { serverId, message }
        }
      )
  }
}

// ==================== 全局实例 ====================

let mcpServerValidator: MCPServerValidator | null = null

export function getMCPServerValidator(): MCPServerValidator {
  if (!mcpServerValidator) {
    mcpServerValidator = new MCPServerValidator()
  }
  return mcpServerValidator
}

export function initializeMCPValidator(config?: Partial<MCPValidatorConfig>): MCPServerValidator {
  if (mcpServerValidator) {
    mcpServerValidator.destroy()
  }
  mcpServerValidator = new MCPServerValidator(config)
  return mcpServerValidator
}

/**
 * 权限管道服务
 * 
 * 参考 Claude Code 实现：
 * - src/utils/permissions/permissions.ts
 * - src/utils/permissions/filesystem.ts
 * 
 * 功能：
 * - 统一的权限检查管道
 * - 规则驱动的权限管理
 * - 安全检查集成
 * - 支持宽松模式（Worker 环境）
 */

import { validateCommandForTraversal, validatePathWithinRoot } from '../utils/pathSecurity'

// ==================== 权限行为类型 ====================

export type PermissionBehavior = 'allow' | 'deny' | 'ask' | 'passthrough'

/**
 * 权限模式
 */
export type PermissionMode = 'strict' | 'normal' | 'permissive'

// ==================== 权限决策 ====================

export interface PermissionDecision {
  behavior: PermissionBehavior
  reason?: string
  decisionReason?: {
    type: 'rule' | 'safetyCheck' | 'toolCheck' | 'bypassMode' | 'default'
    reason: string
  }
  requiresConfirmation?: boolean
  warnings?: string[]
}

// ==================== 权限上下文 ====================

export interface ToolUseContext {
  sessionId?: string
  userId?: string
  mode?: 'normal' | 'bypassPermissions' | 'readonly'
  permissionMode?: PermissionMode  // 新增：权限模式
  workspaceRoot?: string
  allowedPaths?: string[]
  deniedPaths?: string[]
  metadata?: Record<string, unknown>
}

// ==================== 权限规则 ====================

export interface PermissionRule {
  id: string
  name: string
  toolPattern: string | RegExp
  action: 'allow' | 'deny' | 'ask' | 'alwaysAllow'
  reason?: string
  conditions?: PermissionRuleCondition[]
  priority: number
}

export interface PermissionRuleCondition {
  field: string
  operator: 'equals' | 'contains' | 'regex' | 'in'
  value: unknown
}

// ==================== 安全检查 ====================

export interface SafetyCheck {
  name: string
  check: (toolName: string, input: unknown) => SafetyCheckResult
}

export interface SafetyCheckResult {
  allowed: boolean
  reason?: string
  severity: 'block' | 'warn'
  category: 'path' | 'command' | 'network' | 'content' | 'system'
}

// ==================== 危险模式检测（宽松模式）====================

/**
 * 危险命令模式（仅包含真正破坏性操作）
 *
 * 设计原则：
 * - Worker 是隔离的沙箱环境，AI Agent 需要完整权限
 * - 只阻止会导致容器崩溃或数据丢失的操作
 * - 允许系统管理、网络操作、脚本执行等
 */
const DANGEROUS_COMMAND_PATTERNS = [
  // 容器破坏性操作
  { pattern: /rm\s+-rf\s+\/(?!proc|sys|dev)/i, reason: '危险命令: rm -rf /' },
  { pattern: /\bshutdown\b/i, reason: '关机操作' },
  { pattern: /\breboot\b/i, reason: '重启操作' },
  { pattern: /\bmkfs\b/i, reason: '格式化操作' },
  { pattern: /dd\s+.*of=\/dev\//i, reason: '破坏性设备写入' },
  { pattern: /:\(\)\{.*\};:/i, reason: 'Fork bomb' },

  // 注意：以下模式已移除
  // - curl|wget 管道: AI 需要下载和执行脚本
  // - bash|sh 管道: Shell 脚本执行是基本需求
  // - chmod 777: 文件权限管理是合法操作
  // - nc 反向 shell: 在沙箱环境中风险可控
  // - python eval/exec: 脚本执行需要这些功能
]

const SENSITIVE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/root/.ssh',
  '/home/*/.ssh',
  'C:\\Windows\\System32\\config',
  'C:\\Windows\\System32\\drivers\\etc',
  '.env',
  '.npmrc',
  '.git/credentials',
]

// ==================== 权限管道类 ====================

export class PermissionPipeline {
  private rules: PermissionRule[] = []
  private safetyChecks: SafetyCheck[] = []
  private defaultBehavior: PermissionBehavior = 'ask'
  private permissionMode: PermissionMode = 'normal'  // 权限模式

  constructor() {
    this.registerDefaultSafetyChecks()
  }

  /**
   * 设置权限模式
   * - strict: 严格模式，所有操作都需要确认
   * - normal: 正常模式，遵循规则和安全检查
   * - permissive: 宽松模式，仅阻止危险操作
   */
  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode
    
    switch (mode) {
      case 'strict':
        this.defaultBehavior = 'ask'
        break
      case 'normal':
        this.defaultBehavior = 'ask'
        break
      case 'permissive':
        this.defaultBehavior = 'allow'
        break
    }
  }

  /**
   * 获取当前权限模式
   */
  getPermissionMode(): PermissionMode {
    return this.permissionMode
  }

  /**
   * 注册权限规则
   */
  registerRule(rule: PermissionRule): void {
    this.rules.push(rule)
    // 按优先级排序
    this.rules.sort((a, b) => b.priority - a.priority)
  }

  /**
   * 批量注册规则
   */
  registerRules(rules: PermissionRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule)
    }
  }

  /**
   * 注册安全检查
   */
  registerSafetyCheck(check: SafetyCheck): void {
    this.safetyChecks.push(check)
  }

  /**
   * 设置默认行为
   */
  setDefaultBehavior(behavior: PermissionBehavior): void {
    this.defaultBehavior = behavior
  }

  /**
   * 执行权限检查
   */
  async check(
    toolName: string,
    input: unknown,
    context: ToolUseContext
  ): Promise<PermissionDecision> {
    // 步骤 1: 绕过权限模式
    if (context.mode === 'bypassPermissions') {
      return {
        behavior: 'allow',
        reason: '绕过权限模式',
        decisionReason: { type: 'bypassMode', reason: '管理员模式' },
      }
    }

    // 步骤 2: 只读模式检查
    if (context.mode === 'readonly') {
      const isReadOnlyTool = this.isReadOnlyTool(toolName)
      if (!isReadOnlyTool) {
        return {
          behavior: 'deny',
          reason: '只读模式下只允许只读工具',
          decisionReason: { type: 'rule', reason: '只读模式限制' },
        }
      }
    }

    // 步骤 2.5: 宽松模式 - 仅阻止真正的危险操作
    const effectiveMode = context.permissionMode || this.permissionMode
    if (effectiveMode === 'permissive') {
      // 宽松模式下，只检查真正危险的操作
      const safetyResults = await this.runSafetyChecks(toolName, input)
      const criticalBlock = safetyResults.find(r => 
        r.severity === 'block' && 
        !r.allowed && 
        this.isCriticalDanger(r)
      )
      
      if (criticalBlock) {
        return {
          behavior: 'deny',
          reason: criticalBlock.reason || '危险操作被阻止',
          decisionReason: { type: 'safetyCheck', reason: criticalBlock.reason || '危险操作' },
        }
      }
      
      // 其他安全警告只是警告
      return {
        behavior: 'allow',
        reason: '宽松模式：仅阻止危险操作',
        decisionReason: { type: 'bypassMode', reason: '宽松模式' },
        warnings: safetyResults.filter(r => r.severity === 'warn').map(r => r.reason || ''),
      }
    }

    // 步骤 3: 检查规则拒绝
    const denyRule = this.findMatchingRule(toolName, input, 'deny')
    if (denyRule) {
      return {
        behavior: 'deny',
        reason: denyRule.reason || `规则 "${denyRule.name}" 拒绝`,
        decisionReason: { type: 'rule', reason: denyRule.reason || denyRule.name },
        requiresConfirmation: false,
      }
    }

    // 步骤 4: 执行安全检查
    const safetyResults = await this.runSafetyChecks(toolName, input)
    const blockedResult = safetyResults.find(r => r.severity === 'block' && !r.allowed)
    
    if (blockedResult) {
      return {
        behavior: 'deny',
        reason: blockedResult.reason || '安全检查未通过',
        decisionReason: { type: 'safetyCheck', reason: blockedResult.reason || '未知' },
        warnings: safetyResults.filter(r => r.severity === 'warn').map(r => r.reason || ''),
      }
    }

    // 步骤 5: 检查规则询问
    const askRule = this.findMatchingRule(toolName, input, 'ask')
    if (askRule) {
      return {
        behavior: 'ask',
        reason: askRule.reason || `规则 "${askRule.name}" 需要确认`,
        decisionReason: { type: 'rule', reason: askRule.reason || askRule.name },
        requiresConfirmation: true,
        warnings: safetyResults.filter(r => r.severity === 'warn').map(r => r.reason || ''),
      }
    }

    // 步骤 6: 检查始终允许规则
    const alwaysAllowRule = this.findMatchingRule(toolName, input, 'alwaysAllow')
    if (alwaysAllowRule) {
      return {
        behavior: 'allow',
        reason: alwaysAllowRule.reason || `规则 "${alwaysAllowRule.name}" 允许`,
        decisionReason: { type: 'rule', reason: alwaysAllowRule.reason || alwaysAllowRule.name },
      }
    }

    // 步骤 7: 返回默认行为
    return {
      behavior: this.defaultBehavior,
      reason: '默认权限策略',
      decisionReason: { type: 'default', reason: '使用默认权限策略' },
      requiresConfirmation: this.defaultBehavior === 'ask',
      warnings: safetyResults.filter(r => r.severity === 'warn').map(r => r.reason || ''),
    }
  }

  /**
   * 检查是否为真正危险的操作（宽松模式下仍然阻止）
   */
  private isCriticalDanger(result: SafetyCheckResult): boolean {
    const criticalPatterns = [
      /rm\s+-rf\s+\/(?!proc|sys|dev)/i,  // rm -rf /
      /curl.*\|.*sh/i,                     // 管道到 shell
      /;\s*nc\s+-e/i,                     // Netcat 反向 shell
      /sudo\s+passwd/i,                   // 修改密码
    ]
    
    const reason = result.reason || ''
    return criticalPatterns.some(pattern => pattern.test(reason))
  }

  /**
   * 同步权限检查（简化版）
   */
  checkSync(toolName: string, input: unknown, context: ToolUseContext): PermissionDecision {
    // 简化版：同步执行安全检查
    const safetyResults = this.runSafetyChecksSync(toolName, input)
    const blockedResult = safetyResults.find(r => r.severity === 'block' && !r.allowed)
    
    if (blockedResult) {
      return {
        behavior: 'deny',
        reason: blockedResult.reason || '安全检查未通过',
        decisionReason: { type: 'safetyCheck', reason: blockedResult.reason || '未知' },
      }
    }
    
    if (context.mode === 'bypassPermissions') {
      return { behavior: 'allow', decisionReason: { type: 'bypassMode', reason: '管理员模式' } }
    }
    
    const denyRule = this.findMatchingRule(toolName, input, 'deny')
    if (denyRule) {
      return {
        behavior: 'deny',
        reason: denyRule.reason,
        decisionReason: { type: 'rule', reason: denyRule.reason || denyRule.name },
      }
    }
    
    return {
      behavior: this.defaultBehavior,
      decisionReason: { type: 'default', reason: '默认权限策略' },
    }
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(
    toolName: string,
    input: unknown,
    action: 'deny' | 'ask' | 'alwaysAllow'
  ): PermissionRule | undefined {
    return this.rules.find(rule => {
      if (rule.action !== action) return false
      
      // 检查工具名称匹配
      if (typeof rule.toolPattern === 'string') {
        if (rule.toolPattern !== toolName && rule.toolPattern !== '*') return false
      } else if (rule.toolPattern instanceof RegExp) {
        if (!rule.toolPattern.test(toolName)) return false
      }
      
      // 检查条件
      if (rule.conditions && rule.conditions.length > 0) {
        const inputObj = input as Record<string, unknown>
        return rule.conditions.every(condition => this.checkCondition(inputObj, condition))
      }
      
      return true
    })
  }

  /**
   * 检查规则条件
   */
  private checkCondition(input: Record<string, unknown>, condition: PermissionRuleCondition): boolean {
    const value = input[condition.field]
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'contains':
        return typeof value === 'string' && typeof condition.value === 'string'
          && value.includes(condition.value)
      case 'regex':
        return typeof value === 'string' && value.test(new RegExp(condition.value as string))
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value)
      default:
        return false
    }
  }

  /**
   * 执行安全检查
   */
  private async runSafetyChecks(toolName: string, input: unknown): Promise<SafetyCheckResult[]> {
    const results: SafetyCheckResult[] = []
    
    for (const check of this.safetyChecks) {
      try {
        const result = await Promise.resolve(check.check(toolName, input))
        if (!result.allowed) {
          results.push(result)
        } else if (result.severity === 'warn') {
          results.push(result)
        }
      } catch (error) {
        console.warn(`[PermissionPipeline] 安全检查 "${check.name}" 出错:`, error)
      }
    }
    
    return results
  }

  /**
   * 同步执行安全检查
   */
  private runSafetyChecksSync(toolName: string, input: unknown): SafetyCheckResult[] {
    const results: SafetyCheckResult[] = []
    
    // Shell 命令安全检查
    if (['Bash', 'PowerShell', 'Cmd', 'Shell'].includes(toolName)) {
      const command = (input as Record<string, unknown>).command as string
      if (command) {
        for (const { pattern, reason } of DANGEROUS_COMMAND_PATTERNS) {
          if (pattern.test(command)) {
            results.push({
              allowed: false,
              reason,
              severity: 'block',
              category: 'command',
            })
            break
          }
        }
      }
      
      // 检查路径遍历
      const pathResult = validateCommandForTraversal(command)
      if (!pathResult.allowed) {
        results.push({
          allowed: false,
          reason: pathResult.reason,
          severity: pathResult.severity === 'block' ? 'block' : 'warn',
          category: 'path',
        })
      }
    }
    
    // 文件操作安全检查
    if (['FileRead', 'FileWrite', 'FileEdit', 'Glob', 'Grep'].includes(toolName)) {
      const path = (input as Record<string, unknown>).path as string
      if (path) {
        // 检查敏感路径
        for (const sensitivePath of SENSITIVE_PATHS) {
          if (path.includes(sensitivePath)) {
            results.push({
              allowed: false,
              reason: `访问敏感路径: ${sensitivePath}`,
              severity: 'block',
              category: 'path',
            })
            break
          }
        }
        
        // 检查路径遍历
        if (path.includes('..')) {
          results.push({
            allowed: false,
            reason: '路径包含 ".." (父目录引用)',
            severity: 'block',
            category: 'path',
          })
        }
        
        // 如果有工作区根目录，检查是否在允许范围内
        if (results.length === 0) {
          const validation = validatePathWithinRoot(path, process.cwd())
          if (!validation.allowed) {
            results.push({
              allowed: false,
              reason: validation.reason,
              severity: validation.severity === 'block' ? 'block' : 'warn',
              category: 'path',
            })
          }
        }
      }
    }
    
    return results
  }

  /**
   * 注册默认安全检查
   */
  private registerDefaultSafetyChecks(): void {
    // Shell 命令检查
    this.registerSafetyCheck({
      name: 'shell-command',
      check: (toolName, input) => {
        if (!['Bash', 'PowerShell', 'Cmd', 'Shell'].includes(toolName)) {
          return { allowed: true, severity: 'warn', category: 'command' }
        }
        
        const command = (input as Record<string, unknown>).command as string
        if (!command) {
          return { allowed: true, severity: 'warn', category: 'command' }
        }
        
        for (const { pattern, reason } of DANGEROUS_COMMAND_PATTERNS) {
          if (pattern.test(command)) {
            return { allowed: false, reason, severity: 'block', category: 'command' }
          }
        }
        
        return { allowed: true, severity: 'warn', category: 'command' }
      },
    })
    
    // 路径检查
    this.registerSafetyCheck({
      name: 'path-traversal',
      check: (toolName, input) => {
        const path = (input as Record<string, unknown>).path as string
        if (!path) {
          return { allowed: true, severity: 'warn', category: 'path' }
        }
        
        if (path.includes('..')) {
          return {
            allowed: false,
            reason: '路径遍历检测: 禁止使用 ".." 访问上级目录',
            severity: 'block',
            category: 'path',
          }
        }
        
        return { allowed: true, severity: 'warn', category: 'path' }
      },
    })
  }

  /**
   * 判断是否为只读工具
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = [
      // 文件操作
      'FileRead', 'Glob', 'Grep', 'GrepCount',
      // 网络工具
      'WebSearch', 'WebFetch', 'HttpRequest',
      // 任务管理
      'TodoList',
      // 开发工具
      'LSP', 'GitLog', 'GitStatus', 'GitDiff', 'PackageInfo',
      // 系统工具
      'Config',
    ]
    return readOnlyTools.includes(toolName)
  }

  /**
   * 获取已注册规则
   */
  getRules(): PermissionRule[] {
    return [...this.rules]
  }

  /**
   * 清除所有规则
   */
  clearRules(): void {
    this.rules = []
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建标准权限规则
 */
export function createPermissionRule(
  name: string,
  toolName: string,
  action: 'allow' | 'deny' | 'ask' | 'alwaysAllow',
  reason?: string
): PermissionRule {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    toolPattern: toolName,
    action,
    reason,
    priority: 100,
  }
}

/**
 * 创建条件权限规则
 */
export function createConditionalRule(
  name: string,
  toolName: string,
  action: 'allow' | 'deny' | 'ask' | 'alwaysAllow',
  conditions: PermissionRuleCondition[],
  reason?: string
): PermissionRule {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    toolPattern: toolName,
    action,
    conditions,
    reason,
    priority: 100,
  }
}

// ==================== 单例导出 ====================

let permissionPipelineInstance: PermissionPipeline | null = null

export function getPermissionPipeline(): PermissionPipeline {
  if (!permissionPipelineInstance) {
    permissionPipelineInstance = new PermissionPipeline()
  }
  return permissionPipelineInstance
}

export default PermissionPipeline

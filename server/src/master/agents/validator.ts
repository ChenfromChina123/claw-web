/**
 * Agent 定义验证器
 * 
 * 验证 Agent 定义的完整性和正确性
 */

import type {
  AgentDefinition,
  BuiltInAgentDefinition,
  CustomAgentDefinition,
  PermissionMode,
  IsolationMode,
} from './types'

/**
 * 有效的权限模式列表
 */
const VALID_PERMISSION_MODES = ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble']

/**
 * 有效的隔离模式列表
 */
const VALID_ISOLATION_MODES = ['worktree', 'remote']

/**
 * 有效的内存类型列表
 */
const VALID_MEMORY_TYPES = ['user', 'project', 'local']

/**
 * Agent 定义验证错误
 */
export interface AgentValidationError {
  field: string
  message: string
  code: 'MISSING_FIELD' | 'INVALID_TYPE' | 'INVALID_VALUE' | 'MISSING_HANDLER'
}

/**
 * Agent 定义验证结果
 */
export interface AgentValidationResult {
  valid: boolean
  errors: AgentValidationError[]
}

/**
 * 验证 Agent 定义的基本字段
 */
export function validateBaseAgentDefinition(
  definition: Partial<AgentDefinition>
): AgentValidationResult {
  const errors: AgentValidationError[] = []

  // 必填字段验证
  if (!definition.agentType || typeof definition.agentType !== 'string') {
    errors.push({
      field: 'agentType',
      message: 'agentType 是必填字段，且必须是字符串',
      code: 'MISSING_FIELD',
    })
  } else if (definition.agentType.trim() === '') {
    errors.push({
      field: 'agentType',
      message: 'agentType 不能为空字符串',
      code: 'INVALID_VALUE',
    })
  }

  if (!definition.whenToUse || typeof definition.whenToUse !== 'string') {
    errors.push({
      field: 'whenToUse',
      message: 'whenToUse 是必填字段，且必须是字符串',
      code: 'MISSING_FIELD',
    })
  }

  // tools 和 disallowedTools 互斥验证
  if (definition.tools && definition.disallowedTools) {
    const overlap = definition.tools.filter(t => definition.disallowedTools!.includes(t))
    if (overlap.length > 0) {
      errors.push({
        field: 'disallowedTools',
        message: `tools 和 disallowedTools 不能同时包含相同的工具: ${overlap.join(', ')}`,
        code: 'INVALID_VALUE',
      })
    }
  }

  // tools 格式验证
  if (definition.tools !== undefined) {
    if (!Array.isArray(definition.tools)) {
      errors.push({
        field: 'tools',
        message: 'tools 必须是数组',
        code: 'INVALID_TYPE',
      })
    } else if (!definition.tools.every(t => typeof t === 'string')) {
      errors.push({
        field: 'tools',
        message: 'tools 数组中的每个元素必须是字符串',
        code: 'INVALID_TYPE',
      })
    }
  }

  // disallowedTools 格式验证
  if (definition.disallowedTools !== undefined) {
    if (!Array.isArray(definition.disallowedTools)) {
      errors.push({
        field: 'disallowedTools',
        message: 'disallowedTools 必须是数组',
        code: 'INVALID_TYPE',
      })
    } else if (!definition.disallowedTools.every(t => typeof t === 'string')) {
      errors.push({
        field: 'disallowedTools',
        message: 'disallowedTools 数组中的每个元素必须是字符串',
        code: 'INVALID_TYPE',
      })
    }
  }

  // model 格式验证
  if (definition.model !== undefined && typeof definition.model !== 'string') {
    errors.push({
      field: 'model',
      message: 'model 必须是字符串',
      code: 'INVALID_TYPE',
    })
  }

  // permissionMode 枚举验证
  if (definition.permissionMode !== undefined) {
    if (typeof definition.permissionMode !== 'string') {
      errors.push({
        field: 'permissionMode',
        message: 'permissionMode 必须是字符串',
        code: 'INVALID_TYPE',
      })
    } else if (!VALID_PERMISSION_MODES.includes(definition.permissionMode)) {
      errors.push({
        field: 'permissionMode',
        message: `permissionMode 必须是以下值之一: ${VALID_PERMISSION_MODES.join(', ')}`,
        code: 'INVALID_VALUE',
      })
    }
  }

  // maxTurns 验证
  if (definition.maxTurns !== undefined) {
    if (typeof definition.maxTurns !== 'number') {
      errors.push({
        field: 'maxTurns',
        message: 'maxTurns 必须是数字',
        code: 'INVALID_TYPE',
      })
    } else if (definition.maxTurns < 1 || definition.maxTurns > 1000) {
      errors.push({
        field: 'maxTurns',
        message: 'maxTurns 必须在 1-1000 之间',
        code: 'INVALID_VALUE',
      })
    }
  }

  // isolation 枚举验证
  if (definition.isolation !== undefined) {
    if (typeof definition.isolation !== 'string') {
      errors.push({
        field: 'isolation',
        message: 'isolation 必须是字符串',
        code: 'INVALID_TYPE',
      })
    } else if (!VALID_ISOLATION_MODES.includes(definition.isolation)) {
      errors.push({
        field: 'isolation',
        message: `isolation 必须是以下值之一: ${VALID_ISOLATION_MODES.join(', ')}`,
        code: 'INVALID_VALUE',
      })
    }
  }

  // effort 验证
  if (definition.effort !== undefined) {
    if (typeof definition.effort !== 'number' && typeof definition.effort !== 'string') {
      errors.push({
        field: 'effort',
        message: 'effort 必须是数字或字符串',
        code: 'INVALID_TYPE',
      })
    }
  }

  // memory 类型验证
  if (definition.memory !== undefined) {
    if (!VALID_MEMORY_TYPES.includes(definition.memory as string)) {
      errors.push({
        field: 'memory',
        message: `memory 必须是以下值之一: ${VALID_MEMORY_TYPES.join(', ')}`,
        code: 'INVALID_VALUE',
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证内置 Agent 定义
 */
export function validateBuiltInAgentDefinition(
  definition: Partial<BuiltInAgentDefinition>
): AgentValidationResult {
  const errors: AgentValidationError[] = []

  // 验证基本字段
  const baseResult = validateBaseAgentDefinition(definition)
  errors.push(...baseResult.errors)

  // 内置 Agent 必须有 source = 'built-in'
  if (definition.source !== 'built-in') {
    errors.push({
      field: 'source',
      message: '内置 Agent 的 source 必须是 "built-in"',
      code: 'INVALID_VALUE',
    })
  }

  // baseDir 验证
  if (!definition.baseDir || definition.baseDir !== 'built-in') {
    errors.push({
      field: 'baseDir',
      message: '内置 Agent 的 baseDir 必须是 "built-in"',
      code: 'INVALID_VALUE',
    })
  }

  // getSystemPrompt 验证
  if (typeof definition.getSystemPrompt !== 'function') {
    errors.push({
      field: 'getSystemPrompt',
      message: '内置 Agent 必须有 getSystemPrompt 函数',
      code: 'MISSING_HANDLER',
    })
  }

  // 只读 Agent 应该有 disallowedTools
  if (definition.isReadOnly === true) {
    if (!definition.disallowedTools || definition.disallowedTools.length === 0) {
      errors.push({
        field: 'disallowedTools',
        message: '只读 Agent (isReadOnly=true) 应该定义 disallowedTools',
        code: 'MISSING_FIELD',
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证自定义 Agent 定义
 */
export function validateCustomAgentDefinition(
  definition: Partial<CustomAgentDefinition>
): AgentValidationResult {
  const errors: AgentValidationError[] = []

  // 验证基本字段
  const baseResult = validateBaseAgentDefinition(definition)
  errors.push(...baseResult.errors)

  // 自定义 Agent 的 source 必须是 'user' 或 'plugin'
  const validSources = ['user', 'plugin']
  if (definition.source !== undefined && !validSources.includes(definition.source)) {
    errors.push({
      field: 'source',
      message: `自定义 Agent 的 source 必须是以下值之一: ${validSources.join(', ')}`,
      code: 'INVALID_VALUE',
    })
  }

  // 自定义 Agent 必须有 getSystemPrompt 函数
  if (typeof definition.getSystemPrompt !== 'function') {
    errors.push({
      field: 'getSystemPrompt',
      message: '自定义 Agent 必须有 getSystemPrompt 函数',
      code: 'MISSING_HANDLER',
    })
  }

  // filename 验证（如果提供）
  if (definition.filename !== undefined && typeof definition.filename !== 'string') {
    errors.push({
      field: 'filename',
      message: 'filename 必须是字符串',
      code: 'INVALID_TYPE',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 综合验证 Agent 定义
 */
export function validateAgentDefinition(
  definition: Partial<AgentDefinition>
): AgentValidationResult {
  if (definition.source === 'built-in') {
    return validateBuiltInAgentDefinition(definition as Partial<BuiltInAgentDefinition>)
  } else {
    return validateCustomAgentDefinition(definition as Partial<CustomAgentDefinition>)
  }
}

/**
 * 验证 Agent 工具调用参数
 */
export interface AgentCallValidationError {
  field: string
  message: string
  code: 'MISSING_FIELD' | 'INVALID_TYPE' | 'INVALID_ENUM'
}

export interface AgentCallValidationResult {
  valid: boolean
  errors: AgentCallValidationError[]
}

const VALID_AGENT_TYPES = [
  'general-purpose',
  'Explore',
  'Plan',
  'verification',
  'claude-code-guide',
  'statusline-setup',
]

const VALID_MODES = ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble']
const VALID_ISOLATION = ['worktree', 'remote']

export function validateAgentCallInput(input: unknown): AgentCallValidationResult {
  const errors: AgentCallValidationError[] = []

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{
        field: 'input',
        message: '输入必须是对象',
        code: 'INVALID_TYPE',
      }],
    }
  }

  const { prompt, subagent_type, model, mode, isolation, max_turns, run_in_background, name, team_name } = input as Record<string, unknown>

  // prompt 必填
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    errors.push({
      field: 'prompt',
      message: 'prompt 是必填字段，且不能为空',
      code: 'MISSING_FIELD',
    })
  }

  // subagent_type 验证
  if (subagent_type !== undefined) {
    if (typeof subagent_type !== 'string') {
      errors.push({
        field: 'subagent_type',
        message: 'subagent_type 必须是字符串',
        code: 'INVALID_TYPE',
      })
    } else if (!VALID_AGENT_TYPES.includes(subagent_type)) {
      errors.push({
        field: 'subagent_type',
        message: `subagent_type 必须是以下值之一: ${VALID_AGENT_TYPES.join(', ')}`,
        code: 'INVALID_ENUM',
      })
    }
  }

  // model 验证
  if (model !== undefined && typeof model !== 'string') {
    errors.push({
      field: 'model',
      message: 'model 必须是字符串',
      code: 'INVALID_TYPE',
    })
  }

  // mode 验证
  if (mode !== undefined) {
    if (typeof mode !== 'string') {
      errors.push({
        field: 'mode',
        message: 'mode 必须是字符串',
        code: 'INVALID_TYPE',
      })
    } else if (!VALID_MODES.includes(mode)) {
      errors.push({
        field: 'mode',
        message: `mode 必须是以下值之一: ${VALID_MODES.join(', ')}`,
        code: 'INVALID_ENUM',
      })
    }
  }

  // isolation 验证
  if (isolation !== undefined) {
    if (typeof isolation !== 'string') {
      errors.push({
        field: 'isolation',
        message: 'isolation 必须是字符串',
        code: 'INVALID_TYPE',
      })
    } else if (!VALID_ISOLATION.includes(isolation)) {
      errors.push({
        field: 'isolation',
        message: `isolation 必须是以下值之一: ${VALID_ISOLATION.join(', ')}`,
        code: 'INVALID_ENUM',
      })
    }
  }

  // max_turns 验证
  if (max_turns !== undefined) {
    if (typeof max_turns !== 'number') {
      errors.push({
        field: 'max_turns',
        message: 'max_turns 必须是数字',
        code: 'INVALID_TYPE',
      })
    } else if (max_turns < 1 || max_turns > 1000) {
      errors.push({
        field: 'max_turns',
        message: 'max_turns 必须在 1-1000 之间',
        code: 'INVALID_ENUM',
      })
    }
  }

  // run_in_background 验证
  if (run_in_background !== undefined && typeof run_in_background !== 'boolean') {
    errors.push({
      field: 'run_in_background',
      message: 'run_in_background 必须是布尔值',
      code: 'INVALID_TYPE',
    })
  }

  // name 和 team_name 互为依赖
  if (name !== undefined && team_name === undefined) {
    errors.push({
      field: 'team_name',
      message: '使用 name 时必须提供 team_name',
      code: 'MISSING_FIELD',
    })
  }
  if (team_name !== undefined && name === undefined) {
    errors.push({
      field: 'name',
      message: '使用 team_name 时必须提供 name',
      code: 'MISSING_FIELD',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 获取有效的 Agent 类型列表
 */
export function getValidAgentTypes(): string[] {
  return [...VALID_AGENT_TYPES]
}

/**
 * 获取有效的权限模式列表
 */
export function getValidPermissionModes(): string[] {
  return [...VALID_MODES]
}

/**
 * 获取有效的隔离模式列表
 */
export function getValidIsolationModes(): string[] {
  return [...VALID_ISOLATION]
}

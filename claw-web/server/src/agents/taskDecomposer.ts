/**
 * LLM 驱动的任务自动分解器
 *
 * 功能：
 * - 基于 LLM 的任务理解与分解
 * - 任务依赖关系分析
 * - 动态任务队列管理
 * - 子任务并行规划
 * - Skills系统集成（原项目架构）
 */

import { v4 as uuidv4 } from 'uuid'
import type { TeamTask } from './teamManager'
import { getSkillToolCommands, findCommand } from '../commands'
import type { Command } from '../commands'

// ==================== 类型定义 ====================

/**
 * 任务分解模式
 */
export enum DecompositionMode {
  /** 顺序执行 - 任务按顺序执行 */
  SEQUENTIAL = 'sequential',
  /** 并行执行 - 独立任务并行执行 */
  PARALLEL = 'parallel',
  /** 流水线执行 - 按依赖关系图执行 */
  PIPELINE = 'pipeline',
  /** 混合模式 - 根据任务特性自动选择 */
  HYBRID = 'hybrid'
}

/**
 * 子任务
 */
export interface SubTask {
  /** 任务 ID */
  taskId: string
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** Agent 类型 */
  agentType: string
  /** 优先级 (1-10, 1 最高) */
  priority: number
  /** 依赖任务 ID 列表 */
  dependsOn: string[]
  /** 估计执行时间 (毫秒) */
  estimatedDuration?: number
  /** 技能要求 */
  requiredSkills?: string[]
  /** 任务状态 */
  status: 'pending' | 'analyzing' | 'ready' | 'in_progress' | 'completed' | 'failed'
  /** 详细指令 */
  instructions: string
  /** 验收标准 */
  acceptanceCriteria?: string[]
}

/**
 * 分解结果
 */
export interface DecompositionResult {
  /** 是否成功 */
  success: boolean
  /** 原始任务 */
  originalTask: string
  /** 分解后的子任务 */
  subTasks: SubTask[]
  /** 执行计划 */
  executionPlan: {
    mode: DecompositionMode
    estimatedDuration: number
    parallelGroups: string[][] // 可并行执行的任务组
  }
  /** 分析摘要 */
  summary: {
    totalTasks: number
    parallelTasks: number
    sequentialTasks: number
    criticalPath: string[]
  }
  /** 错误信息 */
  error?: string
}

/**
 * LLM 分解请求
 */
export interface TaskDecompositionRequest {
  /** 原始任务描述 */
  task: string
  /** 项目上下文 */
  projectContext?: {
    codebase: string
    language?: string
    framework?: string
    mainFiles?: string[]
  }
  /** 执行偏好 */
  preferences?: {
    mode?: DecompositionMode
    maxTasks?: number
    preferParallel?: boolean
  }
  /** 可用的 Agent 类型 */
  availableAgents?: string[]
}

/**
 * 任务分析结果
 */
export interface TaskAnalysis {
  /** 任务类型分类 */
  category: 'implementation' | 'refactoring' | 'bugfix' | 'testing' | 'documentation' | 'research' | 'mixed'
  /** 复杂度评估 (1-10) */
  complexity: number
  /** 所需技能 */
  requiredSkills: string[]
  /** 潜在风险 */
  risks: string[]
  /** 建议的 Agent 类型 */
  suggestedAgents: Array<{ type: string; reason: string }>
}

/**
 * 任务依赖关系
 */
export interface TaskDependency {
  from: string
  to: string
  type: 'requires' | 'enhances' | 'conflicts'
  reason: string
}

// ==================== LLM 提示模板 ====================

const DECOM_POSITION_PROMPT_TEMPLATE = `你是一个任务分解专家。请将以下复杂任务分解为可执行的子任务。

## 原始任务
{task}

## 项目上下文
{projectContext}

## 可用的 Agent 类型
{availableAgents}

## 可用的 Skills
{availableSkills}

## 执行偏好
{preferences}

请以 JSON 格式返回分解结果：

{
  "analysis": {
    "category": "任务类型 (implementation/refactoring/bugfix/testing/documentation/research/mixed)",
    "complexity": 复杂度评估 (1-10),
    "requiredSkills": ["技能列表"],
    "risks": ["潜在风险"],
    "suggestedAgents": [{"type": "Agent类型", "reason": "原因"}]
  },
  "subTasks": [
    {
      "title": "子任务标题",
      "description": "子任务详细描述",
      "agentType": "最适合的Agent类型",
      "priority": 优先级 (1-10),
      "dependsOn": ["依赖的任务标题"],
      "estimatedDuration": 估计时间(毫秒),
      "requiredSkills": ["所需技能"],
      "instructions": "详细的执行指令",
      "acceptanceCriteria": ["验收标准1", "验收标准2"]
    }
  ],
  "executionPlan": {
    "mode": "执行模式 (sequential/parallel/pipeline/hybrid)",
    "estimatedDuration": 总估计时间(毫秒),
    "parallelGroups": [["任务1", "任务2"], ["任务3"]] // 可并行执行的任务组
  }
}

请确保：
1. 子任务之间有明确的依赖关系
2. 每个子任务都是原子性的，可以独立执行
3. 任务的执行顺序遵循依赖关系
4. 独立任务应尽可能并行执行
5. 考虑任务的复杂度和执行时间
6. 合理使用Skills来增强Agent能力`;

// ==================== 任务自动分解器 ====================

/**
 * LLM 任务分解器
 */
export class TaskDecomposer {
  private llmCaller: LLMCaller
  private defaultAgents: string[]

  constructor(llmCaller: LLMCaller, defaultAgents?: string[]) {
    this.llmCaller = llmCaller
    this.defaultAgents = defaultAgents || [
      'general-purpose',
      'Explore',
      'Plan',
      'verification'
    ]
  }

  /**
   * 分解任务
   */
  async decompose(request: TaskDecompositionRequest): Promise<DecompositionResult> {
    try {
      // 构建提示
      const prompt = await this.buildPrompt(request)

      // 调用 LLM
      const response = await this.llmCaller.call(prompt)

      // 解析响应
      const parsed = this.parseLLMResponse(response)

      // 验证和规范化结果
      return this.validateAndNormalize(parsed, request.task)
    } catch (error) {
      return {
        success: false,
        originalTask: request.task,
        subTasks: [],
        executionPlan: {
          mode: DecompositionMode.SEQUENTIAL,
          estimatedDuration: 0,
          parallelGroups: []
        },
        summary: {
          totalTasks: 0,
          parallelTasks: 0,
          sequentialTasks: 0,
          criticalPath: []
        },
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 快速分解 - 使用启发式方法，不调用 LLM
   */
  decomposeQuickly(task: string, maxTasks: number = 5): DecompositionResult {
    const subTasks = this.generateHeuristicSubtasks(task, maxTasks)
    const { parallelGroups, criticalPath } = this.analyzeDependencies(subTasks)

    return {
      success: true,
      originalTask: task,
      subTasks,
      executionPlan: {
        mode: DecompositionMode.HYBRID,
        estimatedDuration: subTasks.reduce((sum, t) => sum + (t.estimatedDuration || 30000), 0),
        parallelGroups
      },
      summary: {
        totalTasks: subTasks.length,
        parallelTasks: parallelGroups.flat().length,
        sequentialTasks: criticalPath.length,
        criticalPath
      }
    }
  }

  /**
   * 构建 LLM 提示
   */
  private async buildPrompt(request: TaskDecompositionRequest): Promise<string> {
    const projectContext = request.projectContext
      ? `语言: ${request.projectContext.language || '未指定'}
框架: ${request.projectContext.framework || '未指定'}
主要文件: ${request.projectContext.mainFiles?.join(', ') || '未指定'}`
      : '无详细上下文'

    const availableAgents = request.availableAgents?.join(', ') || this.defaultAgents.join(', ')

    // 获取可用的Skills
    const availableSkills = await this.getAvailableSkills(request.projectContext?.codebase || '')

    const preferences = request.preferences
      ? `执行模式: ${request.preferences.mode || '自动'}
最大任务数: ${request.preferences.maxTasks || 10}
偏好并行: ${request.preferences.preferParallel ? '是' : '否'}`
      : '使用默认设置'

    return DECOM_POSITION_PROMPT_TEMPLATE
      .replace('{task}', request.task)
      .replace('{projectContext}', projectContext)
      .replace('{availableAgents}', availableAgents)
      .replace('{availableSkills}', availableSkills)
      .replace('{preferences}', preferences)
  }

  /**
   * 获取可用的Skills列表
   */
  private async getAvailableSkills(cwd: string): Promise<string> {
    try {
      const commands = await getSkillToolCommands(cwd)
      if (commands.length === 0) {
        return '无可用Skills'
      }

      const skillDescriptions = commands.slice(0, 10).map(cmd =>
        `- ${cmd.name}: ${cmd.description || '无描述'}`
      ).join('\n')

      if (commands.length > 10) {
        return `${skillDescriptions}\n... 还有 ${commands.length - 10} 个Skills`
      }
      return skillDescriptions
    } catch {
      return '获取Skills列表失败'
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(response: string): Partial<DecompositionResult> {
    // 尝试提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('无法解析 LLM 响应')
    }

    try {
      const parsed = JSON.parse(jsonMatch[0])
      return parsed
    } catch {
      throw new Error('JSON 解析失败')
    }
  }

  /**
   * 验证和规范化结果
   */
  private validateAndNormalize(
    parsed: Partial<DecompositionResult>,
    originalTask: string
  ): DecompositionResult {
    const subTasks: SubTask[] = (parsed.subTasks || []).map((task: any, index: number) => ({
      taskId: `subtask_${uuidv4().slice(0, 8)}`,
      title: task.title || `子任务 ${index + 1}`,
      description: task.description || '',
      agentType: task.agentType || 'general-purpose',
      priority: Math.max(1, Math.min(10, task.priority || 5)),
      dependsOn: task.dependsOn || [],
      estimatedDuration: task.estimatedDuration || 30000,
      requiredSkills: task.requiredSkills || [],
      status: 'pending' as const,
      instructions: task.instructions || task.description || '',
      acceptanceCriteria: task.acceptanceCriteria || []
    }))

    // 分析依赖关系
    const { parallelGroups, criticalPath } = this.analyzeDependencies(subTasks)

    // 确定执行模式
    let mode = DecompositionMode.SEQUENTIAL
    if (parsed.executionPlan?.mode) {
      mode = DecompositionMode[parsed.executionPlan.mode.toUpperCase() as keyof typeof DecompositionMode] 
        || DecompositionMode.HYBRID
    } else if (parallelGroups.length > 1 && criticalPath.length < subTasks.length) {
      mode = DecompositionMode.HYBRID
    }

    return {
      success: true,
      originalTask,
      subTasks,
      executionPlan: {
        mode,
        estimatedDuration: parsed.executionPlan?.estimatedDuration || 
          subTasks.reduce((sum, t) => sum + (t.estimatedDuration || 30000), 0),
        parallelGroups
      },
      summary: {
        totalTasks: subTasks.length,
        parallelTasks: parallelGroups.flat().length,
        sequentialTasks: criticalPath.length,
        criticalPath
      }
    }
  }

  /**
   * 分析依赖关系，找出可并行执行的任务组
   */
  private analyzeDependencies(subTasks: SubTask[]): {
    parallelGroups: string[][]
    criticalPath: string[]
  } {
    // 构建依赖图
    const taskMap = new Map(subTasks.map(t => [t.title, t]))
    const dependencyGraph = new Map<string, Set<string>>()

    for (const task of subTasks) {
      dependencyGraph.set(task.title, new Set())
      for (const dep of task.dependsOn) {
        // 找到依赖任务的实际 ID
        const depTask = subTasks.find(t => t.title === dep)
        if (depTask) {
          dependencyGraph.get(task.title)!.add(depTask.taskId)
        }
      }
    }

    // 拓扑排序，找出关键路径
    const visited = new Set<string>()
    const inDegree = new Map<string, number>()
    const criticalPath: string[] = []

    for (const task of subTasks) {
      inDegree.set(task.taskId, task.dependsOn.filter(d => {
        return subTasks.some(t => t.title === d)
      }).length)
    }

    // 找出无依赖的任务
    const readyTasks = subTasks
      .filter(t => inDegree.get(t.taskId) === 0)
      .map(t => t.taskId)

    // 简单的并行分组
    const parallelGroups: string[][] = []
    let currentGroup: string[] = [...readyTasks]

    while (currentGroup.length > 0) {
      parallelGroups.push(currentGroup)

      const nextGroup: string[] = []
      for (const taskId of currentGroup) {
        const task = subTasks.find(t => t.taskId === taskId)
        if (task) {
          // 找到等待此任务完成的所有任务
          for (const other of subTasks) {
            if (other.dependsOn.includes(task.title)) {
              const newDegree = (inDegree.get(other.taskId) || 0) - 1
              inDegree.set(other.taskId, newDegree)
              if (newDegree === 0 && !visited.has(other.taskId)) {
                nextGroup.push(other.taskId)
              }
            }
          }
          visited.add(taskId)
        }
      }
      currentGroup = nextGroup.filter(id => !visited.has(id))
    }

    // 关键路径 = 最长的执行链
    const findLongestPath = (startTasks: string[]): string[] => {
      let longest: string[] = []
      const dfs = (taskId: string, path: string[]) => {
        const task = subTasks.find(t => t.taskId === taskId)
        if (!task) return
        
        const newPath = [...path, taskId]
        const deps = subTasks.filter(t => t.dependsOn.includes(task.title))
        
        if (deps.length === 0) {
          if (newPath.length > longest.length) {
            longest = newPath
          }
        } else {
          for (const dep of deps) {
            dfs(dep.taskId, newPath)
          }
        }
      }

      for (const taskId of startTasks) {
        dfs(taskId, [])
      }
      return longest
    }

    return {
      parallelGroups,
      criticalPath: findLongestPath(readyTasks)
    }
  }

  /**
   * 启发式快速分解
   */
  private generateHeuristicSubtasks(task: string, maxTasks: number): SubTask[] {
    const taskLower = task.toLowerCase()
    const subTasks: SubTask[] = []

    // 分析任务关键词
    const isImplementation = taskLower.includes('实现') || taskLower.includes('开发') || taskLower.includes('添加')
    const isRefactoring = taskLower.includes('重构') || taskLower.includes('优化') || taskLower.includes('改进')
    const isBugfix = taskLower.includes('修复') || taskLower.includes('bug') || taskLower.includes('错误')
    const isTesting = taskLower.includes('测试') || taskLower.includes('测试用例')
    const isDocumentation = taskLower.includes('文档') || taskLower.includes('注释')

    // 生成子任务
    if (isImplementation || !subTasks.length) {
      subTasks.push({
        taskId: `subtask_${uuidv4().slice(0, 8)}`,
        title: '理解需求',
        description: '分析任务需求，确定实现方案',
        agentType: 'Plan',
        priority: 1,
        dependsOn: [],
        estimatedDuration: 10000,
        status: 'pending',
        instructions: `分析并理解以下任务：${task}`
      })
    }

    if (isImplementation || isRefactoring) {
      subTasks.push({
        taskId: `subtask_${uuidv4().slice(0, 8)}`,
        title: '探索代码库',
        description: '了解现有代码结构和相关文件',
        agentType: 'Explore',
        priority: 2,
        dependsOn: ['理解需求'],
        estimatedDuration: 20000,
        status: 'pending',
        instructions: '探索项目结构，定位需要修改的文件'
      })
    }

    let action = '';
    if (isImplementation || isRefactoring || isBugfix) {
      action = isBugfix ? '修复问题' : (isRefactoring ? '重构代码' : '实现功能');
      subTasks.push({
        taskId: `subtask_${uuidv4().slice(0, 8)}`,
        title: action,
        description: `执行代码${action}`,
        agentType: 'general-purpose',
        priority: 3,
        dependsOn: ['理解需求', '探索代码库'].filter(d => subTasks.some(s => s.title === d)).length > 0 
          ? ['理解需求', '探索代码库'].filter(d => subTasks.some(s => s.title === d))
          : [],
        estimatedDuration: 60000,
        status: 'pending',
        instructions: task
      })
    }

    if (isTesting || isImplementation) {
      subTasks.push({
        taskId: `subtask_${uuidv4().slice(0, 8)}`,
        title: '编写测试',
        description: '为新功能编写测试用例',
        agentType: 'general-purpose',
        priority: 4,
        dependsOn: [subTasks.find(s => s.title && action && s.title.includes(action))?.title || ''].filter(Boolean),
        estimatedDuration: 30000,
        status: 'pending',
        instructions: '编写单元测试和集成测试'
      })
    }

    subTasks.push({
      taskId: `subtask_${uuidv4().slice(0, 8)}`,
      title: '验证结果',
      description: '验证实现是否满足需求',
      agentType: 'verification',
      priority: 5,
      dependsOn: [subTasks.find(s => s.title && (s.title.includes('实现') || s.title.includes('修复') || s.title.includes('重构')))?.title || ''].filter(Boolean),
      estimatedDuration: 15000,
      status: 'pending',
      instructions: '验证代码正确性和功能完整性'
    })

    // 按优先级排序
    subTasks.sort((a, b) => a.priority - b.priority)

    return subTasks.slice(0, maxTasks)
  }
}

// ==================== LLM 调用接口 ====================

/**
 * LLM 调用接口
 */
export interface LLMCaller {
  call(prompt: string): Promise<string>
}

/**
 * 简单的 LLM 调用实现（示例）
 */
export class SimpleLLMCaller implements LLMCaller {
  private apiEndpoint: string
  private apiKey?: string

  constructor(apiEndpoint: string, apiKey?: string) {
    this.apiEndpoint = apiEndpoint
    this.apiKey = apiKey
  }

  async call(prompt: string): Promise<string> {
    // 这里应该调用实际的 LLM API
    // 暂时返回一个占位符
    throw new Error('请实现实际的 LLM 调用逻辑')
  }
}

// ==================== 转换为 TeamTask ====================

/**
 * 将分解结果转换为团队任务
 */
export function decomposeResultToTeamTasks(result: DecompositionResult): TeamTask[] {
  return result.subTasks.map(subTask => ({
    taskId: subTask.taskId,
    title: subTask.title,
    description: subTask.description,
    status: subTask.status === 'completed' ? 'completed' 
      : subTask.status === 'in_progress' ? 'in_progress' 
      : 'pending',
    priority: 10 - subTask.priority, // 转换为 TeamTask 的优先级 (1-9)
    createdAt: new Date(),
    result: undefined,
    dependsOn: subTask.dependsOn.map(depTitle => {
      const depTask = result.subTasks.find(t => t.title === depTitle)
      return depTask?.taskId || ''
    }).filter(Boolean)
  }))
}

// ==================== 导出 ====================

export type {
  LLMCaller,
  TaskDecompositionRequest,
  TaskAnalysis,
  TaskDependency,
  SubTask,
  DecompositionResult
}
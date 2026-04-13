/**
 * 项目部署服务（融入 Manus 多智能体架构）
 * 
 * 功能：
 * - 规划代理：分析部署需求、评估资源、选择 Worker 容器
 * - 执行代理：在 Worker 容器内部署项目
 * - 验证代理：健康检查、功能测试、质量评估
 * 
 * 架构：
 * - 复用现有 ContainerOrchestrator 的容器池
 * - 在已分配的 Worker 容器内运行多个项目
 * - 通过进程管理器（PM2/Supervisor）管理项目进程
 */

import { v4 as uuidv4 } from 'uuid'
import { getContainerOrchestrator, type ContainerInstance } from '../orchestrator/containerOrchestrator'
import { createWorkerProcessManager, type ProjectConfig, type ProcessStatus } from '../integration/processManager'

// ==================== 类型定义 ====================

/**
 * 项目部署请求
 */
export interface DeploymentRequest {
  userId: string
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  sourceType: 'upload' | 'git' | 'template'
  sourceUrl?: string
  sourceCode?: string
  buildCommand?: string
  startCommand: string
  envVars?: Record<string, string>
  memoryLimit?: string
  autoRestart?: boolean
}

/**
 * 部署计划
 */
export interface DeploymentPlan {
  projectId: string
  userId: string
  name: string
  type: string
  workerContainer?: ContainerInstance
  sourcePath: string
  buildCommand?: string
  startCommand: string
  envVars: Record<string, string>
  memoryLimit: string
  processManager: 'pm2' | 'supervisor'
  estimatedResources: {
    cpu: number
    memory: number
    storage: number
  }
  risks: string[]
}

/**
 * 项目部署信息
 */
export interface ProjectDeployment {
  projectId: string
  userId: string
  workerContainerId: string
  workerPort: number
  internalPort: number
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  status: 'running' | 'stopped' | 'error' | 'building'
  domain?: string
  sourcePath: string
  buildCommand?: string
  startCommand: string
  envVars: Record<string, string>
  processManager: 'pm2' | 'supervisor'
  autoRestart: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 质量报告
 */
export interface QualityReport {
  projectId: string
  healthStatus: 'healthy' | 'unhealthy' | 'unknown'
  responseTime?: number
  errorRate?: number
  uptime?: number
  issues: string[]
  recommendations: string[]
}

/**
 * 资源评估
 */
export interface ResourceEstimation {
  cpu: number
  memory: number
  storage: number
  network: number
}

/**
 * 风险评估
 */
export interface RiskAssessment {
  level: 'low' | 'medium' | 'high'
  risks: string[]
  mitigations: string[]
}

// ==================== 规划代理 ====================

class DeploymentPlanningAgent {
  /**
   * 分析部署请求
   */
  analyzeDeploymentRequest(request: DeploymentRequest): DeploymentPlan {
    const projectId = uuidv4()

    // 确定进程管理器
    const processManager = this.determineProcessManager(request.type)

    // 评估资源需求
    const estimatedResources = this.estimateResources(request)

    // 评估风险
    const risks = this.assessRisks(request)

    return {
      projectId,
      userId: request.userId,
      name: request.name,
      type: request.type,
      sourcePath: `/app/workspaces/users/${request.userId}/projects/${projectId}`,
      buildCommand: request.buildCommand,
      startCommand: request.startCommand,
      envVars: request.envVars || {},
      memoryLimit: request.memoryLimit || '256M',
      processManager,
      estimatedResources,
      risks
    }
  }

  /**
   * 选择 Worker 容器
   */
  async selectWorkerContainer(userId: string): Promise<ContainerInstance | null> {
    const orchestrator = getContainerOrchestrator()
    
    // 检查用户是否已有容器
    const existingMapping = orchestrator.getUserMapping(userId)
    if (existingMapping) {
      console.log(`[PlanningAgent] 用户 ${userId} 已有容器: ${existingMapping.container.containerId}`)
      return existingMapping.container
    }

    // 为用户分配新容器
    const result = await orchestrator.assignContainerToUser(userId)
    if (result.success && result.data) {
      console.log(`[PlanningAgent] 为用户 ${userId} 分配容器: ${result.data.container.containerId}`)
      return result.data.container
    }

    console.error(`[PlanningAgent] 无法为用户 ${userId} 分配容器`)
    return null
  }

  /**
   * 确定进程管理器
   */
  private determineProcessManager(type: string): 'pm2' | 'supervisor' {
    return type === 'nodejs' ? 'pm2' : 'supervisor'
  }

  /**
   * 评估资源需求
   */
  private estimateResources(request: DeploymentRequest): ResourceEstimation {
    const baseResources = {
      nodejs: { cpu: 0.5, memory: 256, storage: 100, network: 10 },
      python: { cpu: 0.3, memory: 128, storage: 50, network: 10 },
      static: { cpu: 0.1, memory: 64, storage: 20, network: 5 },
      custom: { cpu: 0.5, memory: 256, storage: 100, network: 10 }
    }

    return baseResources[request.type] || baseResources.custom
  }

  /**
   * 评估风险
   */
  private assessRisks(request: DeploymentRequest): string[] {
    const risks: string[] = []

    if (request.sourceType === 'git' && !request.sourceUrl) {
      risks.push('缺少 Git 仓库 URL')
    }

    if (!request.startCommand) {
      risks.push('缺少启动命令')
    }

    if (request.type === 'nodejs' && !request.buildCommand) {
      risks.push('Node.js 项目缺少构建命令')
    }

    return risks
  }
}

// ==================== 执行代理 ====================

class DeploymentExecutionAgent {
  /**
   * 在 Worker 容器内执行部署
   */
  async deployInWorker(
    workerContainer: ContainerInstance,
    plan: DeploymentPlan,
    request: DeploymentRequest
  ): Promise<ProjectDeployment> {
    console.log(`[ExecutionAgent] 开始在容器 ${workerContainer.containerId} 内部署项目 ${plan.projectId}`)

    // 创建进程管理器
    const processManager = createWorkerProcessManager(workerContainer.containerId)

    // 准备项目代码
    await this.prepareProjectCode(workerContainer.containerId, plan, request)

    // 启动项目进程
    const projectConfig: ProjectConfig = {
      projectId: plan.projectId,
      userId: plan.userId,
      name: plan.name,
      type: plan.type as any,
      sourcePath: plan.sourcePath,
      buildCommand: plan.buildCommand,
      startCommand: plan.startCommand,
      envVars: plan.envVars,
      memoryLimit: plan.memoryLimit,
      processManager: plan.processManager
    }

    const result = await processManager.startProject(projectConfig)

    if (!result.success) {
      throw new Error(`项目启动失败: ${result.error}`)
    }

    console.log(`[ExecutionAgent] 项目 ${plan.projectId} 已启动，端口: ${result.port}`)

    // 创建部署记录
    const deployment: ProjectDeployment = {
      projectId: plan.projectId,
      userId: plan.userId,
      workerContainerId: workerContainer.containerId,
      workerPort: workerContainer.hostPort,
      internalPort: result.port,
      name: plan.name,
      type: plan.type as any,
      status: 'running',
      sourcePath: plan.sourcePath,
      buildCommand: plan.buildCommand,
      startCommand: plan.startCommand,
      envVars: plan.envVars,
      processManager: plan.processManager,
      autoRestart: request.autoRestart ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    return deployment
  }

  /**
   * 准备项目代码
   */
  private async prepareProjectCode(
    containerId: string,
    plan: DeploymentPlan,
    request: DeploymentRequest
  ): Promise<void> {
    const { exec } = require('child_process')
    const { promisify } = require('util')
    const execAsync = promisify(exec)

    // 创建项目目录
    await execAsync(`docker exec ${containerId} mkdir -p ${plan.sourcePath}`)

    // 根据来源类型准备代码
    switch (request.sourceType) {
      case 'upload':
        // 上传的代码已经通过 API 上传到工作区
        console.log(`[ExecutionAgent] 使用上传的代码`)
        break

      case 'git':
        // 克隆 Git 仓库
        if (request.sourceUrl) {
          await execAsync(`docker exec ${containerId} git clone ${request.sourceUrl} ${plan.sourcePath}`)
          console.log(`[ExecutionAgent] 已克隆 Git 仓库: ${request.sourceUrl}`)
        }
        break

      case 'template':
        // 使用模板创建项目
        console.log(`[ExecutionAgent] 使用模板创建项目`)
        break
    }
  }
}

// ==================== 验证代理 ====================

class DeploymentValidationAgent {
  /**
   * 健康检查
   */
  async healthCheck(
    deployment: ProjectDeployment
  ): Promise<{ healthy: boolean; responseTime?: number }> {
    try {
      const startTime = Date.now()

      // 通过 Worker 容器的端口访问项目
      const { exec } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)

      // 检查容器内项目是否响应
      await execAsync(
        `docker exec ${deployment.workerContainerId} curl -s -o /dev/null -w "%{http_code}" http://localhost:${deployment.internalPort}/ || echo "000"`
      )

      const responseTime = Date.now() - startTime

      return {
        healthy: responseTime < 5000, // 5秒内响应视为健康
        responseTime
      }
    } catch (error) {
      console.error('[ValidationAgent] 健康检查失败:', error)
      return { healthy: false }
    }
  }

  /**
   * 功能测试
   */
  async functionalTest(deployment: ProjectDeployment): Promise<{ passed: boolean; details: string }> {
    try {
      // 基础连通性测试
      const healthResult = await this.healthCheck(deployment)

      if (!healthResult.healthy) {
        return {
          passed: false,
          details: '健康检查失败'
        }
      }

      return {
        passed: true,
        details: `响应时间: ${healthResult.responseTime}ms`
      }
    } catch (error) {
      return {
        passed: false,
        details: error instanceof Error ? error.message : '测试失败'
      }
    }
  }

  /**
   * 质量评估
   */
  async qualityAssessment(deployment: ProjectDeployment): Promise<QualityReport> {
    const issues: string[] = []
    const recommendations: string[] = []

    // 健康检查
    const healthResult = await this.healthCheck(deployment)

    // 功能测试
    const testResult = await this.functionalTest(deployment)

    // 收集问题
    if (!healthResult.healthy) {
      issues.push('服务健康检查失败')
      recommendations.push('检查项目日志，确认启动命令是否正确')
    }

    if (healthResult.responseTime && healthResult.responseTime > 1000) {
      issues.push(`响应时间过长: ${healthResult.responseTime}ms`)
      recommendations.push('考虑优化项目性能或增加资源配额')
    }

    return {
      projectId: deployment.projectId,
      healthStatus: healthResult.healthy ? 'healthy' : 'unhealthy',
      responseTime: healthResult.responseTime,
      issues,
      recommendations
    }
  }
}

// ==================== 项目部署服务 ====================

export class ProjectDeploymentService {
  private planningAgent: DeploymentPlanningAgent
  private executionAgent: DeploymentExecutionAgent
  private validationAgent: DeploymentValidationAgent

  constructor() {
    this.planningAgent = new DeploymentPlanningAgent()
    this.executionAgent = new DeploymentExecutionAgent()
    this.validationAgent = new DeploymentValidationAgent()
  }

  /**
   * 创建项目部署（主入口）
   */
  async createProject(request: DeploymentRequest): Promise<ProjectDeployment> {
    console.log(`[ProjectDeploymentService] 开始部署项目: ${request.name}`)

    // 1. 规划阶段
    const plan = this.planningAgent.analyzeDeploymentRequest(request)
    console.log(`[ProjectDeploymentService] 规划完成，项目ID: ${plan.projectId}`)

    // 检查风险
    if (plan.risks.length > 0) {
      console.warn(`[ProjectDeploymentService] 风险警告: ${plan.risks.join(', ')}`)
    }

    // 2. 选择 Worker 容器
    const workerContainer = await this.planningAgent.selectWorkerContainer(request.userId)
    if (!workerContainer) {
      throw new Error('无法分配 Worker 容器')
    }

    plan.workerContainer = workerContainer

    // 3. 执行阶段
    const deployment = await this.executionAgent.deployInWorker(workerContainer, plan, request)
    console.log(`[ProjectDeploymentService] 部署完成，项目ID: ${deployment.projectId}`)

    // 4. 验证阶段
    const qualityReport = await this.validationAgent.qualityAssessment(deployment)
    console.log(`[ProjectDeploymentService] 质量评估: ${qualityReport.healthStatus}`)

    return deployment
  }

  /**
   * 启动项目
   */
  async startProject(projectId: string, userId: string): Promise<void> {
    // TODO: 从数据库获取项目信息
    // const deployment = await this.getDeployment(projectId, userId)
    // const processManager = createWorkerProcessManager(deployment.workerContainerId)
    // await processManager.restartProject(projectId, deployment.processManager)
  }

  /**
   * 停止项目
   */
  async stopProject(projectId: string, userId: string): Promise<void> {
    // TODO: 从数据库获取项目信息
    // const deployment = await this.getDeployment(projectId, userId)
    // const processManager = createWorkerProcessManager(deployment.workerContainerId)
    // await processManager.stopProject(projectId, deployment.processManager)
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    // TODO: 停止项目并清理资源
  }

  /**
   * 获取项目状态
   */
  async getProjectStatus(projectId: string, userId: string): Promise<ProcessStatus> {
    // TODO: 从数据库获取项目信息并查询状态
    return { running: false }
  }

  /**
   * 获取项目日志
   */
  async getProjectLogs(projectId: string, userId: string, lines?: number): Promise<{ stdout: string; stderr: string }> {
    // TODO: 从数据库获取项目信息并查询日志
    return { stdout: '', stderr: '' }
  }

  /**
   * 列出用户所有项目
   */
  async listUserProjects(userId: string): Promise<ProjectDeployment[]> {
    // TODO: 从数据库查询用户的所有项目
    return []
  }
}

// ==================== 单例实例 ====================

let projectDeploymentService: ProjectDeploymentService | null = null

/**
 * 获取项目部署服务实例
 */
export function getProjectDeploymentService(): ProjectDeploymentService {
  if (!projectDeploymentService) {
    projectDeploymentService = new ProjectDeploymentService()
  }
  return projectDeploymentService
}

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
import { getDeploymentRepository, type CreateDeploymentRequest } from '../db/repositories/deploymentRepository'
import { getWorkerDeploymentClient, type ProjectDeployConfig } from '../integrations/workerDeploymentClient'
import { getDomainService } from './domainService'
import { getReverseProxyService } from './reverseProxyService'
import { getSSLService } from './sslService'

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
  enableExternalAccess?: boolean
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
  publicUrl?: string
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
      sourcePath: `/workspace/projects/${request.userId}/${projectId}`,
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
    const client = getWorkerDeploymentClient()
    return await client.getUserWorker(userId)
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
  ): Promise<{ internalPort: number; error?: string }> {
    console.log(`[ExecutionAgent] 开始在容器 ${workerContainer.containerId} 内部署项目 ${plan.projectId}`)

    const client = getWorkerDeploymentClient()

    // 准备项目配置
    const projectConfig: ProjectDeployConfig = {
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

    // 调用 Worker 部署
    const result = await client.deployProject(workerContainer, projectConfig)

    if (!result.success) {
      console.error(`[ExecutionAgent] 部署失败: ${result.error}`)
      return { internalPort: 0, error: result.error }
    }

    console.log(`[ExecutionAgent] 项目 ${plan.projectId} 已启动，内部端口: ${result.port}`)

    return { internalPort: result.port }
  }
}

// ==================== 验证代理 ====================

class DeploymentValidationAgent {
  /**
   * 健康检查
   */
  async healthCheck(
    container: ContainerInstance,
    projectId: string,
    internalPort: number
  ): Promise<{ healthy: boolean; responseTime?: number }> {
    try {
      const startTime = Date.now()

      // 通过 Worker 容器的端口访问项目
      const { exec } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)

      // 检查容器内项目是否响应
      const { stdout } = await execAsync(
        `docker exec ${container.containerId} curl -s -o /dev/null -w "%{http_code}" http://localhost:${internalPort}/ || echo "000"`
      )

      const statusCode = parseInt(stdout.trim(), 10)
      const responseTime = Date.now() - startTime

      return {
        healthy: statusCode >= 200 && statusCode < 500,
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
  async functionalTest(
    container: ContainerInstance,
    projectId: string,
    internalPort: number
  ): Promise<{ passed: boolean; details: string }> {
    try {
      // 基础连通性测试
      const healthResult = await this.healthCheck(container, projectId, internalPort)

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
  async qualityAssessment(
    container: ContainerInstance,
    projectId: string,
    internalPort: number
  ): Promise<QualityReport> {
    const issues: string[] = []
    const recommendations: string[] = []

    // 健康检查
    const healthResult = await this.healthCheck(container, projectId, internalPort)

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
      projectId,
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
  private repository: ReturnType<typeof getDeploymentRepository>
  private workerClient: ReturnType<typeof getWorkerDeploymentClient>

  constructor() {
    this.planningAgent = new DeploymentPlanningAgent()
    this.executionAgent = new DeploymentExecutionAgent()
    this.validationAgent = new DeploymentValidationAgent()
    this.repository = getDeploymentRepository()
    this.workerClient = getWorkerDeploymentClient()
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

    // 3. 保存到数据库（初始状态为 building）
    const dbRequest: CreateDeploymentRequest = {
      id: plan.projectId,
      user_id: request.userId,
      name: request.name,
      type: request.type,
      worker_container_id: workerContainer.containerId,
      worker_port: workerContainer.hostPort,
      internal_port: 0, // 稍后更新
      source_path: plan.sourcePath,
      source_type: request.sourceType,
      source_url: request.sourceUrl,
      build_command: request.buildCommand,
      start_command: request.startCommand,
      env_vars: request.envVars,
      process_manager: plan.processManager,
      memory_limit: plan.memoryLimit,
      auto_restart: request.autoRestart
    }

    await this.repository.createDeployment(dbRequest)

    // 4. 执行阶段
    const deployResult = await this.executionAgent.deployInWorker(workerContainer, plan, request)

    if (deployResult.error) {
      // 更新状态为 error
      await this.repository.updateStatus(plan.projectId, 'error', deployResult.error)
      throw new Error(`部署失败: ${deployResult.error}`)
    }

    console.log(`[ProjectDeploymentService] 部署完成，项目ID: ${plan.projectId}, 内部端口: ${deployResult.internalPort}`)

    // 5. 更新数据库中的内部端口和状态
    // 注意：这里需要更新 internal_port，但 repository 没有直接的方法
    // 实际实现中可能需要添加 updateInternalPort 方法

    // 6. 验证阶段
    const qualityReport = await this.validationAgent.qualityAssessment(
      workerContainer,
      plan.projectId,
      deployResult.internalPort
    )
    console.log(`[ProjectDeploymentService] 质量评估: ${qualityReport.healthStatus}`)

    // 更新状态为 running
    await this.repository.updateStatus(plan.projectId, 'running')

    // 7. 如果启用外部访问，配置域名和反向代理
    let domain: string | undefined
    let publicUrl: string | undefined

    if (request.enableExternalAccess) {
      const accessResult = await this.enableExternalAccess(plan.projectId, request.userId)
      domain = accessResult.domain
      publicUrl = accessResult.publicUrl
    }

    // 8. 返回部署信息
    return {
      projectId: plan.projectId,
      userId: request.userId,
      workerContainerId: workerContainer.containerId,
      workerPort: workerContainer.hostPort,
      internalPort: deployResult.internalPort,
      name: request.name,
      type: request.type,
      status: 'running',
      domain,
      publicUrl,
      sourcePath: plan.sourcePath,
      buildCommand: request.buildCommand,
      startCommand: request.startCommand,
      envVars: request.envVars || {},
      processManager: plan.processManager,
      autoRestart: request.autoRestart ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * 开启外部访问
   */
  async enableExternalAccess(projectId: string, userId: string): Promise<{ domain: string; publicUrl: string }> {
    // 获取部署信息
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    // 获取容器名称（Docker 网络通信需要容器名而非容器ID）
    let containerName: string | undefined
    try {
      const { getContainerOrchestrator } = await import('../orchestrator/containerOrchestrator')
      const orchestrator = getContainerOrchestrator()
      const userMapping = orchestrator.getUserMapping(userId)
      if (userMapping) {
        containerName = userMapping.container.containerName
      }
    } catch (error) {
      console.warn('[ProjectDeploymentService] 获取容器名称失败，将使用 hostPort 模式:', error)
    }

    // 分配域名
    const domainService = getDomainService()
    const domainInfo = await domainService.assignDomain(projectId, userId)

    // 配置反向代理
    const reverseProxyService = getReverseProxyService()
    const proxyConfig = {
      projectId,
      domain: domainInfo.domain,
      workerPort: deployment.worker_port,
      internalPort: deployment.internal_port,
      containerName,
      sslEnabled: true
    }

    const nginxConfig = await reverseProxyService.generateNginxConfig(proxyConfig)
    await reverseProxyService.writeNginxConfig(projectId, nginxConfig)
    await reverseProxyService.reloadNginx()

    // 申请 SSL 证书
    const sslService = getSSLService()
    await sslService.requestCertificate({
      domain: domainInfo.domain,
      email: 'admin@claw-web.com'
    })

    // 更新数据库
    await this.repository.updateDomain(projectId, domainInfo.domain, domainInfo.domainId, 'subdomain')

    return {
      domain: domainInfo.domain,
      publicUrl: `https://${domainInfo.domain}`
    }
  }

  /**
   * 关闭外部访问
   */
  async disableExternalAccess(projectId: string, userId: string): Promise<boolean> {
    // 获取部署信息
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    // 删除反向代理配置
    const reverseProxyService = getReverseProxyService()
    await reverseProxyService.removeNginxConfig(projectId)
    await reverseProxyService.reloadNginx()

    // 更新数据库
    await this.repository.disableExternalAccess(projectId)

    return true
  }

  /**
   * 启动项目
   */
  async startProject(projectId: string, userId: string): Promise<void> {
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    const orchestrator = getContainerOrchestrator()
    const container = orchestrator.getUserMapping(userId)?.container

    if (!container) {
      throw new Error('Worker 容器不存在')
    }

    // 调用 Worker 启动项目
    await this.workerClient.restartProject(container, projectId, deployment.process_manager)

    // 更新状态
    await this.repository.updateStatus(projectId, 'running')
  }

  /**
   * 停止项目
   */
  async stopProject(projectId: string, userId: string): Promise<void> {
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    const orchestrator = getContainerOrchestrator()
    const container = orchestrator.getUserMapping(userId)?.container

    if (!container) {
      throw new Error('Worker 容器不存在')
    }

    // 调用 Worker 停止项目
    await this.workerClient.stopProject(container, projectId, deployment.process_manager)

    // 更新状态
    await this.repository.updateStatus(projectId, 'stopped')
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    // 如果外部访问已启用，先关闭
    if (deployment.external_access_enabled) {
      await this.disableExternalAccess(projectId, userId)
    }

    // 停止项目
    const orchestrator = getContainerOrchestrator()
    const container = orchestrator.getUserMapping(userId)?.container

    if (container) {
      await this.workerClient.stopProject(container, projectId, deployment.process_manager)
    }

    // 从数据库删除
    await this.repository.deleteDeployment(projectId, userId)
  }

  /**
   * 获取项目状态
   */
  async getProjectStatus(projectId: string, userId: string): Promise<any> {
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    const orchestrator = getContainerOrchestrator()
    const container = orchestrator.getUserMapping(userId)?.container

    if (!container) {
      return { running: false, status: 'unknown' }
    }

    // 从 Worker 获取实时状态
    const workerStatus = await this.workerClient.getProjectStatus(
      container,
      projectId,
      deployment.process_manager
    )

    return {
      ...deployment,
      workerStatus
    }
  }

  /**
   * 获取项目日志
   */
  async getProjectLogs(projectId: string, userId: string, lines: number = 100): Promise<{ stdout: string; stderr: string }> {
    const deployment = await this.repository.getDeployment(projectId, userId)
    if (!deployment) {
      throw new Error('部署不存在')
    }

    const orchestrator = getContainerOrchestrator()
    const container = orchestrator.getUserMapping(userId)?.container

    if (!container) {
      return { stdout: '', stderr: '' }
    }

    return await this.workerClient.getProjectLogs(container, projectId, lines)
  }

  /**
   * 列出用户所有项目
   */
  async listUserProjects(userId: string): Promise<any[]> {
    return await this.repository.getUserDeployments(userId)
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

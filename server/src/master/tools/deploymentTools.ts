/**
 * 部署相关工具
 *
 * 功能：
 * - 部署项目
 * - 管理项目生命周期（启动、停止、重启）
 * - 获取项目状态和日志
 * - 开启/关闭外部访问
 *
 * 使用场景：
 * - AI Agent 部署用户项目
 * - 管理已部署的项目
 */

import { getProjectDeploymentService } from '../services/projectDeploymentService'
import { getDeploymentRepository } from '../db/repositories/deploymentRepository'

// ==================== 工具定义 ====================

/**
 * 部署项目工具
 */
export const deployProjectTool = {
  name: 'deploy_project',
  description: '在 Worker 容器中部署一个项目。支持 Node.js、Python、静态网站等类型。部署成功后项目会自动运行。',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '项目名称，用于标识和管理'
      },
      type: {
        type: 'string',
        enum: ['nodejs', 'python', 'static', 'custom'],
        description: '项目类型：nodejs（Node.js）、python（Python）、static（静态网站）、custom（自定义）'
      },
      sourceType: {
        type: 'string',
        enum: ['upload', 'git', 'template'],
        description: '源代码来源：upload（已上传）、git（Git仓库）、template（模板）'
      },
      sourceUrl: {
        type: 'string',
        description: 'Git 仓库 URL（当 sourceType 为 git 时必填）'
      },
      buildCommand: {
        type: 'string',
        description: '构建命令（可选），如 "npm install && npm run build"'
      },
      startCommand: {
        type: 'string',
        description: '启动命令（必填），如 "npm start" 或 "python app.py"'
      },
      envVars: {
        type: 'object',
        description: '环境变量（可选），如 {"NODE_ENV": "production", "PORT": "3000"}'
      },
      memoryLimit: {
        type: 'string',
        description: '内存限制（可选），如 "256M"、"512M"，默认 256M'
      },
      enableExternalAccess: {
        type: 'boolean',
        description: '是否开启外部访问（可选），开启后会分配子域名，默认 false'
      }
    },
    required: ['name', 'type', 'sourceType', 'startCommand']
  }
}

/**
 * 启动项目工具
 */
export const startProjectTool = {
  name: 'start_project',
  description: '启动一个已停止的项目',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

/**
 * 停止项目工具
 */
export const stopProjectTool = {
  name: 'stop_project',
  description: '停止一个正在运行的项目',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

/**
 * 获取项目状态工具
 */
export const getProjectStatusTool = {
  name: 'get_project_status',
  description: '获取项目的运行状态和基本信息',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

/**
 * 获取项目日志工具
 */
export const getProjectLogsTool = {
  name: 'get_project_logs',
  description: '获取项目的运行日志',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      },
      lines: {
        type: 'number',
        description: '获取的日志行数（可选），默认 100 行'
      }
    },
    required: ['projectId']
  }
}

/**
 * 列出用户项目工具
 */
export const listProjectsTool = {
  name: 'list_projects',
  description: '列出当前用户的所有部署项目',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  }
}

/**
 * 删除项目工具
 */
export const deleteProjectTool = {
  name: 'delete_project',
  description: '删除一个项目及其所有资源',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

/**
 * 开启外部访问工具
 */
export const enableExternalAccessTool = {
  name: 'enable_external_access',
  description: '为项目开启外部访问，会分配一个子域名（如 project-123.claw-web.com）',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

/**
 * 关闭外部访问工具
 */
export const disableExternalAccessTool = {
  name: 'disable_external_access',
  description: '关闭项目的外部访问',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: '项目ID'
      }
    },
    required: ['projectId']
  }
}

// ==================== 工具执行函数 ====================

/**
 * 执行部署项目
 */
export async function executeDeployProject(
  userId: string,
  params: {
    name: string
    type: 'nodejs' | 'python' | 'static' | 'custom'
    sourceType: 'upload' | 'git' | 'template'
    sourceUrl?: string
    buildCommand?: string
    startCommand: string
    envVars?: Record<string, string>
    memoryLimit?: string
    enableExternalAccess?: boolean
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()

    const deployment = await deploymentService.createProject({
      userId,
      name: params.name,
      type: params.type,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl,
      buildCommand: params.buildCommand,
      startCommand: params.startCommand,
      envVars: params.envVars,
      memoryLimit: params.memoryLimit,
      enableExternalAccess: params.enableExternalAccess
    })

    return {
      success: true,
      data: {
        projectId: deployment.projectId,
        name: deployment.name,
        status: deployment.status,
        domain: deployment.domain,
        publicUrl: deployment.publicUrl,
        internalPort: deployment.internalPort
      }
    }
  } catch (error) {
    console.error('[DeploymentTools] 部署项目失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '部署失败'
    }
  }
}

/**
 * 执行启动项目
 */
export async function executeStartProject(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    await deploymentService.startProject(params.projectId, userId)

    return { success: true }
  } catch (error) {
    console.error('[DeploymentTools] 启动项目失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '启动失败'
    }
  }
}

/**
 * 执行停止项目
 */
export async function executeStopProject(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    await deploymentService.stopProject(params.projectId, userId)

    return { success: true }
  } catch (error) {
    console.error('[DeploymentTools] 停止项目失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '停止失败'
    }
  }
}

/**
 * 执行获取项目状态
 */
export async function executeGetProjectStatus(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    const status = await deploymentService.getProjectStatus(params.projectId, userId)

    return {
      success: true,
      data: status
    }
  } catch (error) {
    console.error('[DeploymentTools] 获取项目状态失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取状态失败'
    }
  }
}

/**
 * 执行获取项目日志
 */
export async function executeGetProjectLogs(
  userId: string,
  params: { projectId: string; lines?: number }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    const logs = await deploymentService.getProjectLogs(params.projectId, userId, params.lines)

    return {
      success: true,
      data: logs
    }
  } catch (error) {
    console.error('[DeploymentTools] 获取项目日志失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取日志失败'
    }
  }
}

/**
 * 执行列出用户项目
 */
export async function executeListProjects(
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    const projects = await deploymentService.listUserProjects(userId)

    return {
      success: true,
      data: {
        total: projects.length,
        projects
      }
    }
  } catch (error) {
    console.error('[DeploymentTools] 列出项目失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '列出项目失败'
    }
  }
}

/**
 * 执行删除项目
 */
export async function executeDeleteProject(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    await deploymentService.deleteProject(params.projectId, userId)

    return { success: true }
  } catch (error) {
    console.error('[DeploymentTools] 删除项目失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除失败'
    }
  }
}

/**
 * 执行开启外部访问
 */
export async function executeEnableExternalAccess(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    const result = await deploymentService.enableExternalAccess(params.projectId, userId)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('[DeploymentTools] 开启外部访问失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '开启外部访问失败'
    }
  }
}

/**
 * 执行关闭外部访问
 */
export async function executeDisableExternalAccess(
  userId: string,
  params: { projectId: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const deploymentService = getProjectDeploymentService()
    await deploymentService.disableExternalAccess(params.projectId, userId)

    return { success: true }
  } catch (error) {
    console.error('[DeploymentTools] 关闭外部访问失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '关闭外部访问失败'
    }
  }
}

// ==================== 工具集合 ====================

/**
 * 所有部署工具定义
 */
export const deploymentToolDefinitions = [
  deployProjectTool,
  startProjectTool,
  stopProjectTool,
  getProjectStatusTool,
  getProjectLogsTool,
  listProjectsTool,
  deleteProjectTool,
  enableExternalAccessTool,
  disableExternalAccessTool
]

/**
 * 部署工具执行映射
 */
export const deploymentToolExecutors: Record<string, (userId: string, params: any) => Promise<any>> = {
  deploy_project: executeDeployProject,
  start_project: executeStartProject,
  stop_project: executeStopProject,
  get_project_status: executeGetProjectStatus,
  get_project_logs: executeGetProjectLogs,
  list_projects: executeListProjects,
  delete_project: executeDeleteProject,
  enable_external_access: executeEnableExternalAccess,
  disable_external_access: executeDisableExternalAccess
}

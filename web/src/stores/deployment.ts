/**
 * 项目部署状态管理
 * 
 * 功能：
 * - 管理项目部署列表
 * - 管理项目状态
 * - 管理日志查看
 * - 管理外部访问配置
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ProjectDeployment,
  CreateDeploymentRequest,
  ProjectStatus,
  ProjectLogs
} from '@/api/deploymentApi'
import {
  getDeployments,
  createDeployment as createDeploymentApi,
  startDeployment as startDeploymentApi,
  stopDeployment as stopDeploymentApi,
  restartDeployment as restartDeploymentApi,
  deleteDeployment as deleteDeploymentApi,
  getDeploymentLogs as getDeploymentLogsApi,
  getDeploymentStatus as getDeploymentStatusApi
} from '@/api/deploymentApi'

export const useDeploymentStore = defineStore('deployment', () => {
  // ==================== 状态 ====================

  /**
   * 项目列表
   */
  const projects = ref<ProjectDeployment[]>([])

  /**
   * 当前选中的项目
   */
  const currentProject = ref<ProjectDeployment | null>(null)

  /**
   * 项目状态映射
   */
  const projectStatuses = ref<Map<string, ProjectStatus>>(new Map())

  /**
   * 项目日志映射
   */
  const projectLogs = ref<Map<string, ProjectLogs>>(new Map())

  /**
   * 加载状态
   */
  const loading = ref(false)

  /**
   * 错误信息
   */
  const error = ref<string | null>(null)

  // ==================== 计算属性 ====================

  /**
   * 运行中的项目数量
   */
  const runningProjectsCount = computed(() => {
    return projects.value.filter(p => p.status === 'running').length
  })

  /**
   * 已停止的项目数量
   */
  const stoppedProjectsCount = computed(() => {
    return projects.value.filter(p => p.status === 'stopped').length
  })

  /**
   * 错误的项目数量
   */
  const errorProjectsCount = computed(() => {
    return projects.value.filter(p => p.status === 'error').length
  })

  // ==================== 方法 ====================

  /**
   * 加载项目列表
   */
  async function loadProjects() {
    loading.value = true
    error.value = null

    try {
      const response = await getDeployments()
      if (response.success) {
        projects.value = response.data.projects
      } else {
        error.value = response.error || '加载项目列表失败'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载项目列表失败'
      console.error('[DeploymentStore] 加载项目列表失败:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建新项目
   */
  async function createProject(data: CreateDeploymentRequest): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await createDeploymentApi(data)
      if (response.success) {
        projects.value.push(response.data)
        return true
      } else {
        error.value = response.error || '创建项目失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建项目失败'
      console.error('[DeploymentStore] 创建项目失败:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 启动项目
   */
  async function startProject(projectId: string): Promise<boolean> {
    try {
      const response = await startDeploymentApi(projectId)
      if (response.success) {
        const project = projects.value.find(p => p.projectId === projectId)
        if (project) {
          project.status = 'running'
        }
        return true
      }
      return false
    } catch (err) {
      console.error('[DeploymentStore] 启动项目失败:', err)
      return false
    }
  }

  /**
   * 停止项目
   */
  async function stopProject(projectId: string): Promise<boolean> {
    try {
      const response = await stopDeploymentApi(projectId)
      if (response.success) {
        const project = projects.value.find(p => p.projectId === projectId)
        if (project) {
          project.status = 'stopped'
        }
        return true
      }
      return false
    } catch (err) {
      console.error('[DeploymentStore] 停止项目失败:', err)
      return false
    }
  }

  /**
   * 重启项目
   */
  async function restartProject(projectId: string): Promise<boolean> {
    try {
      const response = await restartDeploymentApi(projectId)
      if (response.success) {
        const project = projects.value.find(p => p.projectId === projectId)
        if (project) {
          project.status = 'running'
        }
        return true
      }
      return false
    } catch (err) {
      console.error('[DeploymentStore] 重启项目失败:', err)
      return false
    }
  }

  /**
   * 删除项目
   */
  async function deleteProject(projectId: string): Promise<boolean> {
    try {
      const response = await deleteDeploymentApi(projectId)
      if (response.success) {
        const index = projects.value.findIndex(p => p.projectId === projectId)
        if (index !== -1) {
          projects.value.splice(index, 1)
        }
        return true
      }
      return false
    } catch (err) {
      console.error('[DeploymentStore] 删除项目失败:', err)
      return false
    }
  }

  /**
   * 获取项目状态
   */
  async function fetchProjectStatus(projectId: string) {
    try {
      const response = await getDeploymentStatusApi(projectId)
      if (response.success) {
        projectStatuses.value.set(projectId, response.data)
      }
    } catch (err) {
      console.error('[DeploymentStore] 获取项目状态失败:', err)
    }
  }

  /**
   * 获取项目日志
   */
  async function fetchProjectLogs(projectId: string, lines: number = 100) {
    try {
      const response = await getDeploymentLogsApi(projectId, lines)
      if (response.success) {
        projectLogs.value.set(projectId, response.data)
      }
    } catch (err) {
      console.error('[DeploymentStore] 获取项目日志失败:', err)
    }
  }

  /**
   * 设置当前项目
   */
  function setCurrentProject(project: ProjectDeployment | null) {
    currentProject.value = project
  }

  /**
   * 清除错误
   */
  function clearError() {
    error.value = null
  }

  return {
    // 状态
    projects,
    currentProject,
    projectStatuses,
    projectLogs,
    loading,
    error,

    // 计算属性
    runningProjectsCount,
    stoppedProjectsCount,
    errorProjectsCount,

    // 方法
    loadProjects,
    createProject,
    startProject,
    stopProject,
    restartProject,
    deleteProject,
    fetchProjectStatus,
    fetchProjectLogs,
    setCurrentProject,
    clearError
  }
})

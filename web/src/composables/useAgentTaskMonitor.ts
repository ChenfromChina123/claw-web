/**
 * useAgentTaskMonitor - Agent任务监控组合式函数
 * 
 * 功能：
 * - 全局管理Agent后台任务的创建和更新
 * - 与Agent Store集成，实时响应WebSocket事件
 * - 提供面板展开/收起/最小化状态管理
 * - 支持任务取消和清除已完成任务
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { BackgroundTask, BackgroundTaskStatus } from '@/types/agentWorkflow'

/** 面板显示状态 */
export type PanelMode = 'hidden' | 'minimized' | 'expanded'

/** 任务监控状态 */
export interface TaskMonitorState {
  tasks: BackgroundTask[]
  activeCount: number
  completedCount: number
  failedCount: number
  panelMode: PanelMode
}

/** 刷新间隔（毫秒） */
const REFRESH_INTERVAL = 5000

let refreshTimer: number | null = null

/** 面板模式状态（全局单例） */
const panelMode = ref<PanelMode>('hidden')

/** 是否已初始化WS监听 */
let wsListenersAttached = false

/**
 * Agent任务监控组合式函数
 */
export function useAgentTaskMonitor() {
  const agentStore = useAgentStore()

  /** 所有后台任务 */
  const tasks = computed(() => {
    return Array.from(agentStore.backgroundTasks.values())
      .sort((a, b) => b.createdAt - a.createdAt)
  })

  /** 活跃任务（运行中+等待中） */
  const activeTasks = computed(() => {
    return tasks.value.filter(t => t.status === 'RUNNING' || t.status === 'PENDING')
  })

  /** 活跃任务数量 */
  const activeCount = computed(() => activeTasks.value.length)

  /** 已完成任务数量 */
  const completedCount = computed(() => {
    return tasks.value.filter(t => t.status === 'COMPLETED').length
  })

  /** 失败任务数量 */
  const failedCount = computed(() => {
    return tasks.value.filter(t => t.status === 'FAILED').length
  })

  /** 是否有活跃任务 */
  const hasActiveTasks = computed(() => activeCount.value > 0)

  /** 是否有失败任务 */
  const hasFailedTasks = computed(() => failedCount.value > 0)

  /** 是否显示面板 */
  const showPanel = computed(() => panelMode.value !== 'hidden')

  /** 是否展开面板 */
  const isExpanded = computed(() => panelMode.value === 'expanded')

  /** 是否最小化 */
  const isMinimized = computed(() => panelMode.value === 'minimized')

  /** 监控状态汇总 */
  const monitorState = computed<TaskMonitorState>(() => ({
    tasks: tasks.value,
    activeCount: activeCount.value,
    completedCount: completedCount.value,
    failedCount: failedCount.value,
    panelMode: panelMode.value
  }))

  /**
   * 展开面板
   */
  function expandPanel() {
    panelMode.value = 'expanded'
  }

  /**
   * 最小化面板
   */
  function minimizePanel() {
    panelMode.value = 'minimized'
  }

  /**
   * 隐藏面板
   */
  function hidePanel() {
    panelMode.value = 'hidden'
  }

  /**
   * 切换面板展开/最小化
   */
  function togglePanel() {
    if (panelMode.value === 'expanded') {
      panelMode.value = 'minimized'
    } else {
      panelMode.value = 'expanded'
    }
  }

  /**
   * 从最小化徽章打开面板
   */
  function openFromBadge() {
    panelMode.value = 'expanded'
  }

  /**
   * 取消后台任务
   */
  async function cancelTask(taskId: string) {
    try {
      await agentStore.cancelBackgroundTask(taskId)
    } catch (error) {
      console.error('[AgentTaskMonitor] 取消任务失败:', error)
    }
  }

  /**
   * 清除已完成的任务
   */
  function clearCompletedTasks() {
    const completedIds = tasks.value
      .filter(t => t.status === 'COMPLETED' || t.status === 'FAILED' || t.status === 'CANCELLED')
      .map(t => t.taskId)
    
    completedIds.forEach(id => {
      agentStore.backgroundTasks.delete(id)
    })
  }

  /**
   * 刷新任务列表
   */
  async function refreshTasks() {
    try {
      await agentStore.refreshBackgroundTasks()
    } catch (error) {
      console.error('[AgentTaskMonitor] 刷新任务失败:', error)
    }
  }

  /**
   * 格式化时间
   */
  function formatTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`

    const date = new Date(timestamp)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  /**
   * 格式化耗时
   */
  function formatDuration(start?: number, end?: number): string {
    if (!start) return ''
    const endTime = end || Date.now()
    const duration = endTime - start

    if (duration < 1000) return `${duration}ms`
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`
    return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`
  }

  /**
   * 获取状态配置
   */
  function getStatusConfig(status: BackgroundTaskStatus) {
    const configs: Record<BackgroundTaskStatus, {
      color: string
      bgColor: string
      label: string
      icon: string
    }> = {
      PENDING: { color: '#999', bgColor: 'rgba(153,153,153,0.1)', label: '等待中', icon: '⏳' },
      RUNNING: { color: '#2080f0', bgColor: 'rgba(32,128,240,0.1)', label: '运行中', icon: '⚡' },
      COMPLETED: { color: '#18a058', bgColor: 'rgba(24,160,88,0.1)', label: '已完成', icon: '✅' },
      FAILED: { color: '#d03050', bgColor: 'rgba(208,48,80,0.1)', label: '失败', icon: '❌' },
      CANCELLED: { color: '#999', bgColor: 'rgba(153,153,153,0.1)', label: '已取消', icon: '🚫' }
    }
    return configs[status] || configs.PENDING
  }

  /** 监听活跃任务变化，自动显示面板 */
  watch(activeCount, (newCount, oldCount) => {
    if (newCount > 0 && panelMode.value === 'hidden') {
      panelMode.value = 'minimized'
    }
  })

  /** 启动自动刷新 */
  function startAutoRefresh() {
    if (refreshTimer) return
    refreshTimer = window.setInterval(refreshTasks, REFRESH_INTERVAL)
  }

  /** 停止自动刷新 */
  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  onMounted(() => {
    refreshTasks()
    startAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    tasks,
    activeTasks,
    activeCount,
    completedCount,
    failedCount,
    hasActiveTasks,
    hasFailedTasks,
    showPanel,
    isExpanded,
    isMinimized,
    panelMode,
    monitorState,
    expandPanel,
    minimizePanel,
    hidePanel,
    togglePanel,
    openFromBadge,
    cancelTask,
    clearCompletedTasks,
    refreshTasks,
    formatTime,
    formatDuration,
    getStatusConfig
  }
}

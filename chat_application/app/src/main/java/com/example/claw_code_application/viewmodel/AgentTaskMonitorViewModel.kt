package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.AgentBackgroundTask
import com.example.claw_code_application.data.api.models.AgentTaskMonitorState
import com.example.claw_code_application.data.api.models.BackgroundTaskStatus
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.websocket.WebSocketManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Agent任务监控ViewModel
 * 全局管理Agent后台任务的创建、更新和状态变化
 * 通过WebSocket实时接收任务事件，持久化显示任务进度
 */
class AgentTaskMonitorViewModel(
    private val tokenManager: TokenManager,
    private val webSocketManager: WebSocketManager
) : ViewModel() {

    private val _tasks = mutableStateListOf<AgentBackgroundTask>()
    val tasks: List<AgentBackgroundTask> = _tasks

    private val _monitorState = MutableStateFlow(AgentTaskMonitorState())
    val monitorState: StateFlow<AgentTaskMonitorState> = _monitorState.asStateFlow()

    private val _isExpanded = MutableStateFlow(false)
    val isExpanded: StateFlow<Boolean> = _isExpanded.asStateFlow()

    private val _isMinimized = MutableStateFlow(true)
    val isMinimized: StateFlow<Boolean> = _isMinimized.asStateFlow()

    init {
        viewModelScope.launch {
            webSocketManager.incomingMessages.collect { event ->
                event?.let { handleWebSocketEvent(it) }
            }
        }
    }

    /**
     * 处理WebSocket事件，提取Agent任务相关事件
     */
    private fun handleWebSocketEvent(event: WebSocketManager.WebSocketEvent) {
        when (event) {
            is WebSocketManager.WebSocketEvent.ToolStart -> {
                onTaskCreated(event.id, event.name)
            }
            is WebSocketManager.WebSocketEvent.ToolEnd -> {
                onTaskUpdated(event.id, BackgroundTaskStatus.COMPLETED)
            }
            is WebSocketManager.WebSocketEvent.ToolError -> {
                onTaskUpdated(event.id, BackgroundTaskStatus.FAILED, event.error)
            }
            is WebSocketManager.WebSocketEvent.ToolProgress -> {
                onTaskProgressUpdated(event.id)
            }
            is WebSocketManager.WebSocketEvent.MessageStart -> {
                onAgentStarted(event.messageId)
            }
            is WebSocketManager.WebSocketEvent.ConversationEnd -> {
                onAgentCompleted()
            }
            else -> {}
        }
        updateMonitorState()
    }

    /**
     * 任务创建事件处理
     */
    private fun onTaskCreated(taskId: String, taskName: String) {
        val existing = _tasks.find { it.taskId == taskId }
        if (existing == null) {
            _tasks.add(
                0,
                AgentBackgroundTask(
                    taskId = taskId,
                    name = taskName,
                    status = BackgroundTaskStatus.RUNNING,
                    createdAt = System.currentTimeMillis(),
                    startedAt = System.currentTimeMillis()
                )
            )
        }
        if (_isMinimized.value && _tasks.any { it.status == BackgroundTaskStatus.RUNNING }) {
            _isMinimized.value = false
        }
        updateMonitorState()
    }

    /**
     * 任务状态更新事件处理
     */
    private fun onTaskUpdated(taskId: String, newStatus: BackgroundTaskStatus, error: String? = null) {
        val index = _tasks.indexOfFirst { it.taskId == taskId }
        if (index != -1) {
            val old = _tasks[index]
            _tasks[index] = old.copy(
                status = newStatus,
                error = error,
                completedAt = if (newStatus == BackgroundTaskStatus.COMPLETED || newStatus == BackgroundTaskStatus.FAILED) {
                    System.currentTimeMillis()
                } else null,
                progress = if (newStatus == BackgroundTaskStatus.COMPLETED) 100 else old.progress
            )
        }
        updateMonitorState()
    }

    /**
     * 任务进度更新事件处理
     */
    private fun onTaskProgressUpdated(taskId: String) {
        val index = _tasks.indexOfFirst { it.taskId == taskId }
        if (index != -1) {
            val old = _tasks[index]
            if (old.progress < 90) {
                _tasks[index] = old.copy(progress = old.progress + 10)
            }
        }
    }

    /**
     * Agent开始执行
     */
    private fun onAgentStarted(messageId: String) {
        if (_isMinimized.value) {
            _isMinimized.value = false
        }
    }

    /**
     * Agent执行完成
     */
    private fun onAgentCompleted() {
        updateMonitorState()
    }

    /**
     * 更新监控面板状态
     */
    private fun updateMonitorState() {
        _monitorState.value = AgentTaskMonitorState(
            tasks = _tasks.toList(),
            activeTaskCount = _tasks.count { it.status == BackgroundTaskStatus.RUNNING || it.status == BackgroundTaskStatus.PENDING },
            completedTaskCount = _tasks.count { it.status == BackgroundTaskStatus.COMPLETED },
            failedTaskCount = _tasks.count { it.status == BackgroundTaskStatus.FAILED },
            isExpanded = _isExpanded.value,
            isMinimized = _isMinimized.value
        )
    }

    /**
     * 切换展开/收起状态
     */
    fun toggleExpanded() {
        _isExpanded.value = !_isExpanded.value
        updateMonitorState()
    }

    /**
     * 切换最小化/展开状态
     */
    fun toggleMinimized() {
        _isMinimized.value = !_isMinimized.value
        if (!_isMinimized.value) {
            _isExpanded.value = true
        }
        updateMonitorState()
    }

    /**
     * 清除已完成的任务
     */
    fun clearCompletedTasks() {
        _tasks.removeAll { it.status == BackgroundTaskStatus.COMPLETED || it.status == BackgroundTaskStatus.FAILED || it.status == BackgroundTaskStatus.CANCELLED }
        updateMonitorState()
    }

    /**
     * 取消指定任务
     */
    fun cancelTask(taskId: String) {
        onTaskUpdated(taskId, BackgroundTaskStatus.CANCELLED)
    }

    /**
     * 获取活跃任务数量
     */
    fun getActiveTaskCount(): Int {
        return _tasks.count { it.status == BackgroundTaskStatus.RUNNING || it.status == BackgroundTaskStatus.PENDING }
    }

    companion object {
        /**
         * 提供ViewModel工厂方法
         */
        fun provideFactory(
            tokenManager: TokenManager,
            webSocketManager: WebSocketManager
        ): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return AgentTaskMonitorViewModel(tokenManager, webSocketManager) as T
                }
            }
        }
    }
}

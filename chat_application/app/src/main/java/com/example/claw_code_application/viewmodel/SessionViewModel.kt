package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.util.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 会话列表ViewModel
 * 管理会话的获取、创建、删除等操作
 */
class SessionViewModel(
    private val chatRepository: ChatRepository,
    private val tokenManager: TokenManager
) : ViewModel() {

    companion object {
        private const val TAG = "SessionViewModel"
    }

    /** UI状态密封类 */
    sealed class UiState {
        data object Idle : UiState()
        data object Loading : UiState()
        data class Success(val sessions: List<Session>) : UiState()
        data class Error(val message: String) : UiState()
    }

    /** 私有可观察状态 */
    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    /** 会话列表（用于乐观更新）*/
    private val _sessions = mutableStateListOf<Session>()
    val sessions: List<Session> = _sessions

    /** 当前选中的会话ID */
    var selectedSessionId: String? = null
        private set

    /**
     * 加载会话列表
     */
    fun loadSessions() {
        Logger.d(TAG, "开始加载会话列表...")
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            Logger.d(TAG, "UI状态: Loading")

            val result = chatRepository.getSessions()
            result.fold(
                onSuccess = { sessionList ->
                    val list = sessionList ?: emptyList()
                    Logger.i(TAG, "加载会话成功: 共 ${list.size} 个会话")
                    _sessions.clear()
                    _sessions.addAll(list)
                    _uiState.value = UiState.Success(_sessions.toList())
                    Logger.d(TAG, "UI状态: Success, 会话数: ${_sessions.size}")
                },
                onFailure = { e ->
                    val errorMsg = e.message ?: "加载会话失败"
                    Logger.e(TAG, "加载会话失败: $errorMsg", e)
                    _uiState.value = UiState.Error(errorMsg)
                    Logger.d(TAG, "UI状态: Error - $errorMsg")
                }
            )
        }
    }

    /**
     * 创建新会话并返回其ID
     * @return 新创建的会话ID，如果失败返回null
     */
    suspend fun createNewSession(): String? {
        Logger.d(TAG, "开始创建新会话...")
        return try {
            val result = chatRepository.createSession()
            result.fold(
                onSuccess = { newSession ->
                    Logger.i(TAG, "创建会话成功: id=${newSession.id}")
                    // 添加到列表头部
                    _sessions.add(0, newSession)
                    selectedSessionId = newSession.id
                    _uiState.value = UiState.Success(_sessions.toList())
                    Logger.d(TAG, "当前选中会话: $selectedSessionId")
                    newSession.id
                },
                onFailure = { e ->
                    Logger.e(TAG, "创建会话失败: ${e.message}", e)
                    null
                }
            )
        } catch (e: Exception) {
            Logger.e(TAG, "创建会话异常", e)
            null
        }
    }

    /**
     * 选择会话
     * @param sessionId 会话ID
     */
    fun selectSession(sessionId: String) {
        Logger.d(TAG, "选择会话: $sessionId")
        selectedSessionId = sessionId
    }

    /**
     * 删除会话
     * @param sessionId 会话ID
     */
    fun deleteSession(sessionId: String) {
        Logger.d(TAG, "开始删除会话: $sessionId")
        viewModelScope.launch {
            val result = chatRepository.deleteSession(sessionId)
            result.fold(
                onSuccess = {
                    Logger.i(TAG, "删除会话成功: $sessionId")
                    // 从列表中移除
                    _sessions.removeAll { it.id == sessionId }

                    // 如果删除的是当前选中会话，清空选择
                    if (selectedSessionId == sessionId) {
                        Logger.d(TAG, "删除的是当前选中会话，清空选择")
                        selectedSessionId = null
                    }

                    _uiState.value = UiState.Success(_sessions.toList())
                    Logger.d(TAG, "删除后会话数: ${_sessions.size}")
                },
                onFailure = { e ->
                    val errorMsg = e.message ?: "删除会话失败"
                    Logger.e(TAG, "删除会话失败: $errorMsg", e)
                    _uiState.value = UiState.Error(errorMsg)
                }
            )
        }
    }

    /**
     * 刷新会话列表（重新加载）
     */
    fun refresh() {
        Logger.d(TAG, "刷新会话列表...")
        loadSessions()
    }

    /**
     * 清空当前选择
     */
    fun clearSelection() {
        Logger.d(TAG, "清空会话选择")
        selectedSessionId = null
    }
}

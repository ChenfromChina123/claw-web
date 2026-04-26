package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.ChatRepository
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
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            
            val result = chatRepository.getSessions()
            result.fold(
                onSuccess = { sessionList ->
                    val list = sessionList ?: emptyList()
                    _sessions.clear()
                    _sessions.addAll(list)
                    _uiState.value = UiState.Success(_sessions.toList())
                },
                onFailure = { e ->
                    _uiState.value = UiState.Error(e.message ?: "加载会话失败")
                }
            )
        }
    }

    /**
     * 创建新会话并返回其ID
     * @return 新创建的会话ID，如果失败返回null
     */
    suspend fun createNewSession(): String? {
        return try {
            val result = chatRepository.createSession()
            result.fold(
                onSuccess = { newSession ->
                    // 添加到列表头部
                    _sessions.add(0, newSession)
                    selectedSessionId = newSession.id
                    _uiState.value = UiState.Success(_sessions.toList())
                    newSession.id
                },
                onFailure = { null }
            )
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 选择会话
     * @param sessionId 会话ID
     */
    fun selectSession(sessionId: String) {
        selectedSessionId = sessionId
    }

    /**
     * 删除会话
     * @param sessionId 会话ID
     */
    fun deleteSession(sessionId: String) {
        viewModelScope.launch {
            val result = chatRepository.deleteSession(sessionId)
            result.fold(
                onSuccess = {
                    // 从列表中移除
                    _sessions.removeAll { it.id == sessionId }
                    
                    // 如果删除的是当前选中会话，清空选择
                    if (selectedSessionId == sessionId) {
                        selectedSessionId = null
                    }
                    
                    _uiState.value = UiState.Success(_sessions.toList())
                },
                onFailure = { e ->
                    _uiState.value = UiState.Error(e.message ?: "删除会话失败")
                }
            )
        }
    }

    /**
     * 刷新会话列表（重新加载）
     */
    fun refresh() {
        loadSessions()
    }

    /**
     * 清空当前选择
     */
    fun clearSelection() {
        selectedSessionId = null
    }

    companion object {
        /**
         * 提供ViewModel工厂方法
         */
        fun provideFactory(
            chatRepository: ChatRepository,
            tokenManager: com.example.claw_code_application.data.local.TokenManager
        ): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return SessionViewModel(chatRepository, tokenManager) as T
                }
            }
        }
    }
}

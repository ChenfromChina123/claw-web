package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.CachedChatRepository
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.util.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 会话列表ViewModel
 * 管理会话的获取、创建、删除等操作
 * 支持本地缓存，实现离线优先策略
 */
class SessionViewModel(
    private val chatRepository: CachedChatRepository,
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
     * 使用缓存优先策略：先显示本地缓存，后台更新网络数据
     */
    fun loadSessions(forceRefresh: Boolean = false) {
        Logger.d(TAG, "开始加载会话列表... forceRefresh=$forceRefresh")
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            Logger.d(TAG, "UI状态: Loading")

            chatRepository.getSessions(forceRefresh).collect { result ->
                when (result) {
                    is CachedChatRepository.Result.Loading -> {
                        // 保持 Loading 状态
                    }
                    is CachedChatRepository.Result.Success -> {
                        val list = result.data
                        Logger.i(TAG, "加载会话成功: 共 ${list.size} 个会话")
                        // 使用会话ID去重，保留最新的会话数据
                        val uniqueSessions = list.distinctBy { it.id }
                        if (uniqueSessions.size < list.size) {
                            Logger.w(TAG, "发现重复会话，已去重: ${list.size - uniqueSessions.size} 个")
                        }
                        _sessions.clear()
                        _sessions.addAll(uniqueSessions)
                        _uiState.value = UiState.Success(_sessions.toList())
                        Logger.d(TAG, "UI状态: Success, 会话数: ${_sessions.size}")
                    }
                    is CachedChatRepository.Result.Error -> {
                        val errorMsg = result.message
                        Logger.e(TAG, "加载会话失败: $errorMsg", result.exception ?: Exception(errorMsg))
                        _uiState.value = UiState.Error(errorMsg)
                        Logger.d(TAG, "UI状态: Error - $errorMsg")
                    }
                }
            }
        }
    }

    /**
     * 创建新会话并返回其ID
     * @return 新创建的会话ID，如果失败返回null
     */
    suspend fun createNewSession(): String? {
        Logger.d(TAG, "开始创建新会话...")
        return try {
            val result = chatRepository.createSession(null, "qwen-plus")
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    val newSession = result.data
                    Logger.i(TAG, "创建会话成功: id=${newSession.id}")
                    _sessions.add(0, newSession)
                    selectedSessionId = newSession.id
                    _uiState.value = UiState.Success(_sessions.toList())
                    Logger.d(TAG, "当前选中会话: $selectedSessionId")
                    newSession.id
                }
                is CachedChatRepository.Result.Error -> {
                    Logger.e(TAG, "创建会话失败: ${result.message}")
                    null
                }
                is CachedChatRepository.Result.Loading -> null
            }
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
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    Logger.i(TAG, "删除会话成功: $sessionId")
                    _sessions.removeAll { it.id == sessionId }

                    if (selectedSessionId == sessionId) {
                        Logger.d(TAG, "删除的是当前选中会话，清空选择")
                        selectedSessionId = null
                    }

                    _uiState.value = UiState.Success(_sessions.toList())
                    Logger.d(TAG, "删除后会话数: ${_sessions.size}")
                }
                is CachedChatRepository.Result.Error -> {
                    val errorMsg = result.message
                    Logger.e(TAG, "删除会话失败: $errorMsg")
                    _uiState.value = UiState.Error(errorMsg)
                }
                is CachedChatRepository.Result.Loading -> {
                    // 忽略
                }
            }
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

    companion object {
        private const val TAG = "SessionViewModel"

        /**
         * 提供ViewModel工厂方法
         * @param cachedChatRepository 带缓存的聊天仓库
         * @param tokenManager Token管理器
         */
        fun provideFactory(
            cachedChatRepository: CachedChatRepository,
            tokenManager: com.example.claw_code_application.data.local.TokenManager
        ): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return SessionViewModel(cachedChatRepository, tokenManager) as T
                }
            }
        }
    }
}

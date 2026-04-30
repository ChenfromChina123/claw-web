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
import java.util.UUID

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
     * 加载后自动按置顶状态排序
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
                        // 按置顶状态排序后添加
                        val sortedSessions = uniqueSessions.sortedWith(
                            compareByDescending<Session> { it.isPinned }
                                .thenByDescending { it.updatedAt }
                        )
                        _sessions.addAll(sortedSessions)
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
     * 本地临时会话列表（尚未同步到后端的会话）
     */
    private val _localOnlySessions = mutableStateListOf<Session>()

    /**
     * 创建新会话（懒创建模式）
     * 只在客户端生成临时会话ID，不立即调用后端API
     * 当用户发送第一条消息时，才真正在后端创建会话
     * 
     * 如果已经存在本地临时会话（未发送消息），则复用该会话而不是创建新的
     * @return 新创建或复用的临时会话ID
     */
    fun createNewSession(): String {
        Logger.d(TAG, "开始懒创建新会话（仅客户端）...")

        // 检查是否已有本地临时会话（未发送消息的空会话）
        val existingLocalSession = _localOnlySessions.firstOrNull()
        if (existingLocalSession != null) {
            Logger.d(TAG, "发现已有本地临时会话，复用该会话: ${existingLocalSession.id}")
            selectedSessionId = existingLocalSession.id
            _uiState.value = UiState.Success(_sessions.toList())
            return existingLocalSession.id
        }

        // 生成临时会话ID
        val tempSessionId = UUID.randomUUID().toString()
        Logger.d(TAG, "生成临时会话ID: $tempSessionId")

        // 创建本地临时会话对象
        val now = System.currentTimeMillis()
        val newSession = Session(
            id = tempSessionId,
            title = "新对话",
            createdAt = now.toString(),
            updatedAt = now.toString(),
            model = "qwen-plus",
            isLocalOnly = true  // 标记为仅本地存在
        )

        // 添加到本地会话列表
        _localOnlySessions.add(newSession)
        _sessions.add(0, newSession)
        selectedSessionId = tempSessionId
        _uiState.value = UiState.Success(_sessions.toList())

        Logger.i(TAG, "懒创建会话成功（仅客户端）: id=$tempSessionId")
        Logger.d(TAG, "当前选中会话: $selectedSessionId")

        return tempSessionId
    }

    /**
     * 将本地临时会话转换为真实会话（在后端创建后调用）
     * @param tempSessionId 临时会话ID
     * @param realSession 后端返回的真实会话
     */
    fun convertLocalSessionToReal(tempSessionId: String, realSession: Session) {
        Logger.d(TAG, "转换本地会话为真实会话: temp=$tempSessionId, real=${realSession.id}")

        // 从本地列表中移除
        _localOnlySessions.removeAll { it.id == tempSessionId }

        // 更新主会话列表
        val index = _sessions.indexOfFirst { it.id == tempSessionId }
        if (index != -1) {
            _sessions[index] = realSession.copy(isLocalOnly = false)
            Logger.d(TAG, "已更新会话列表中的临时会话为真实会话")
        }

        // 如果当前选中的是临时会话，更新为真实会话ID
        if (selectedSessionId == tempSessionId) {
            selectedSessionId = realSession.id
            Logger.d(TAG, "已更新选中会话ID为: ${realSession.id}")
        }

        _uiState.value = UiState.Success(_sessions.toList())
    }

    /**
     * 检查会话是否是仅本地存在的临时会话
     * @param sessionId 会话ID
     * @return 是否是临时会话
     */
    fun isLocalOnlySession(sessionId: String): Boolean {
        return _localOnlySessions.any { it.id == sessionId }
    }

    /**
     * 将本地临时会话转换为真实会话（在后端创建）
     * 当用户向本地临时会话发送第一条消息时调用
     * @param tempSessionId 临时会话ID
     * @return 后端创建的真实会话，如果失败返回null
     */
    suspend fun createRealSession(tempSessionId: String): Session? {
        Logger.d(TAG, "开始将本地临时会话转换为真实会话: temp=$tempSessionId")

        // 检查是否是本地临时会话
        val localSession = _localOnlySessions.find { it.id == tempSessionId }
        if (localSession == null) {
            Logger.w(TAG, "未找到本地临时会话: $tempSessionId")
            return null
        }

        return try {
            // 调用后端API创建真实会话
            val result = chatRepository.createSession(null, localSession.model ?: "qwen-plus")

            when (result) {
                is CachedChatRepository.Result.Success -> {
                    val realSession = result.data
                    Logger.i(TAG, "后端创建会话成功: ${realSession.id}")

                    // 转换本地临时会话为真实会话
                    convertLocalSessionToReal(tempSessionId, realSession)

                    realSession
                }
                is CachedChatRepository.Result.Error -> {
                    Logger.e(TAG, "后端创建会话失败: ${result.message}")
                    null
                }
                is CachedChatRepository.Result.Loading -> {
                    Logger.w(TAG, "后端创建会话返回Loading状态")
                    null
                }
            }
        } catch (e: Exception) {
            Logger.e(TAG, "创建真实会话异常", e)
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
     * 如果是本地临时会话，直接从本地列表删除，不调用后端API
     * @param sessionId 会话ID
     */
    fun deleteSession(sessionId: String) {
        Logger.d(TAG, "开始删除会话: $sessionId")

        // 检查是否是本地临时会话
        if (isLocalOnlySession(sessionId)) {
            Logger.d(TAG, "删除本地临时会话（仅本地）: $sessionId")

            // 从本地列表中移除
            _localOnlySessions.removeAll { it.id == sessionId }
            _sessions.removeAll { it.id == sessionId }

            if (selectedSessionId == sessionId) {
                Logger.d(TAG, "删除的是当前选中会话，清空选择")
                selectedSessionId = null
            }

            _uiState.value = UiState.Success(_sessions.toList())
            Logger.i(TAG, "本地临时会话删除成功: $sessionId, 剩余会话数: ${_sessions.size}")
            return
        }

        // 非本地临时会话，调用后端API删除
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
     * 置顶/取消置顶会话
     * @param sessionId 会话ID
     * @param isPinned 是否置顶
     */
    fun pinSession(sessionId: String, isPinned: Boolean) {
        Logger.d(TAG, "开始${if (isPinned) "置顶" else "取消置顶"}会话: $sessionId")
        viewModelScope.launch {
            val result = chatRepository.updateSession(sessionId, isPinned = isPinned)
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    Logger.i(TAG, "${if (isPinned) "置顶" else "取消置顶"}会话成功: $sessionId")
                    // 更新本地会话列表
                    val index = _sessions.indexOfFirst { it.id == sessionId }
                    if (index != -1) {
                        val updatedSession = _sessions[index].copy(isPinned = isPinned)
                        _sessions[index] = updatedSession
                        // 重新排序：置顶的在前，按时间倒序
                        sortSessions()
                    }
                    _uiState.value = UiState.Success(_sessions.toList())
                }
                is CachedChatRepository.Result.Error -> {
                    val errorMsg = result.message
                    Logger.e(TAG, "${if (isPinned) "置顶" else "取消置顶"}会话失败: $errorMsg")
                    _uiState.value = UiState.Error(errorMsg)
                }
                is CachedChatRepository.Result.Loading -> {
                    // 忽略
                }
            }
        }
    }

    /**
     * 重命名会话
     * @param sessionId 会话ID
     * @param newTitle 新标题
     */
    fun renameSession(sessionId: String, newTitle: String) {
        Logger.d(TAG, "开始重命名会话: $sessionId -> $newTitle")
        viewModelScope.launch {
            val result = chatRepository.updateSession(sessionId, title = newTitle)
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    Logger.i(TAG, "重命名会话成功: $sessionId")
                    // 更新本地会话列表
                    val index = _sessions.indexOfFirst { it.id == sessionId }
                    if (index != -1) {
                        val updatedSession = _sessions[index].copy(title = newTitle)
                        _sessions[index] = updatedSession
                    }
                    _uiState.value = UiState.Success(_sessions.toList())
                }
                is CachedChatRepository.Result.Error -> {
                    val errorMsg = result.message
                    Logger.e(TAG, "重命名会话失败: $errorMsg")
                    _uiState.value = UiState.Error(errorMsg)
                }
                is CachedChatRepository.Result.Loading -> {
                    // 忽略
                }
            }
        }
    }

    /**
     * 排序会话列表：置顶的在前，然后按更新时间倒序
     */
    private fun sortSessions() {
        val sortedList = _sessions.sortedWith(
            compareByDescending<Session> { it.isPinned }
                .thenByDescending { it.updatedAt }
        )
        _sessions.clear()
        _sessions.addAll(sortedList)
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

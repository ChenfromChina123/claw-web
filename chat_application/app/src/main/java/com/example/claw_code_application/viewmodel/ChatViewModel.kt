package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.repository.ChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * 聊天ViewModel
 * 处理会话管理、消息发送、Agent执行等核心业务逻辑
 */
class ChatViewModel(
    private val chatRepository: ChatRepository,
    private val tokenManager: TokenManager
) : ViewModel() {

    /** UI状态密封类 */
    sealed class UiState {
        data object Idle : UiState()
        data object Loading : UiState()
        data class Success(
            val messages: List<Message>,
            val toolCalls: List<ToolCall>,
            val executionStatus: ExecutionStatus?
        ) : UiState()
        data class Error(val message: String) : UiState()
    }

    /** 私有可观察状态 */
    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    /** 当前会话ID */
    var currentSessionId: String? = null
        private set

    /** 消息列表（用于乐观更新）*/
    private val _messages = mutableStateListOf<Message>()
    val messages: List<Message> = _messages

    /** 工具调用列表 */
    private val _toolCalls = mutableStateListOf<ToolCall>()
    val toolCalls: List<ToolCall> = _toolCalls

    /**
     * 发送消息并执行Agent
     * @param content 用户输入的消息内容
     */
    fun sendMessage(content: String) {
        viewModelScope.launch {
            // 确保有可用会话
            val session = ensureSession() ?: run {
                _uiState.value = UiState.Error("无法创建会话")
                return@launch
            }

            try {
                // 1. 乐观更新：立即显示用户消息
                val userMessage = Message(
                    id = UUID.randomUUID().toString(),
                    role = "user",
                    content = content,
                    timestamp = System.currentTimeMillis().toString(),
                    isStreaming = false
                )
                _messages.add(userMessage)

                // 2. 设置加载状态
                _uiState.value = UiState.Loading

                // 3. 调用Agent执行API
                when (val result = chatRepository.executeAgent(
                    sessionId = session.id,
                    task = content,
                    prompt = content
                )) {
                    is Result.Success -> {
                        val response = result.data!!
                        // 添加AI回复消息
                        response.messages.forEach { msg ->
                            _messages.add(msg)
                        }

                        // 更新工具调用列表
                        _toolCalls.clear()
                        _toolCalls.addAll(response.toolCalls)

                        _uiState.value = UiState.Success(
                            messages = _messages.toList(),
                            toolCalls = _toolCalls.toList(),
                            executionStatus = response.executionStatus
                        )
                    }
                    is Result.Failure -> {
                        _uiState.value = UiState.Error(
                            result.exception.message ?: "发送消息失败"
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "网络错误")
            }
        }
    }

    /**
     * 加载会话历史消息
     * @param sessionId 会话ID
     */
    fun loadSession(sessionId: String) {
        viewModelScope.launch {
            try {
                currentSessionId = sessionId
                _uiState.value = UiState.Loading

                when (val result = chatRepository.getSessionDetail(sessionId)) {
                    is Result.Success -> {
                        val detail = result.data!!
                        _messages.clear()
                        _messages.addAll(detail.messages)

                        _toolCalls.clear()
                        _toolCalls.addAll(detail.toolCalls)

                        _uiState.value = UiState.Success(
                            messages = _messages.toList(),
                            toolCalls = _toolCalls.toList(),
                            executionStatus = null
                        )
                    }
                    is Result.Failure -> {
                        _uiState.value = UiState.Error(
                            result.exception.message ?: "加载会话失败"
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "加载失败")
            }
        }
    }

    /**
     * 中断Agent执行
     */
    fun abortExecution() {
        viewModelScope.launch {
            try {
                chatRepository.interruptAgent()
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "idle",
                        currentTurn = 0,
                        maxTurns = 100,
                        progress = 0,
                        message = "已中断"
                    )
                )
            } catch (e: Exception) {
                // 忽略中断错误
            }
        }
    }

    /**
     * 确保有可用会话，没有则创建新的
     */
    private suspend fun ensureSession(): Session? {
        return currentSessionId?.let { id ->
            Session(id = id, title = "", createdAt = "", updatedAt = "")
        } ?: run {
            when (val result = chatRepository.createSession()) {
                is Result.Success -> {
                    currentSessionId = result.data!!.id
                    result.data
                }
                is Result.Failure -> null
            }
        }
    }

    /**
     * 清空当前会话状态
     */
    fun clearSession() {
        currentSessionId = null
        _messages.clear()
        _toolCalls.clear()
        _uiState.value = UiState.Idle
    }

    companion object {
        /**
         * 提供ViewModel工厂方法
         */
        fun provideFactory(
            chatRepository: ChatRepository,
            tokenManager: TokenManager
        ): javax.inject.Provider<ChatViewModel> {
            return javax.inject.Provider { ChatViewModel(chatRepository, tokenManager) }
        }
    }
}

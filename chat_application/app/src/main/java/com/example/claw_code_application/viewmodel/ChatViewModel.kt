package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.data.websocket.WebSocketManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * 聊天ViewModel
 * 处理会话管理、消息发送、Agent执行等核心业务逻辑
 * 支持WebSocket流式输出
 */
class ChatViewModel(
    private val chatRepository: ChatRepository,
    private val tokenManager: TokenManager,
    private val webSocketManager: WebSocketManager = WebSocketManager()
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

    /** WebSocket连接状态 */
    val connectionState = webSocketManager.connectionState

    /** 当前正在流式输出的消息ID - 用于将工具调用关联到对应的助手消息 */
    private var streamingMessageId: String? = null
    
    /** 当前正在累积工具输入参数的工具ID和参数 */
    private var pendingToolInput = mutableMapOf<String, StringBuilder>()
    
    /** 消息ID与工具调用ID的映射 - 用于正确关联工具调用到消息 */
    private val messageToToolCalls = mutableMapOf<String, MutableList<String>>()
    
    /** 获取与指定消息关联的工具调用列表 */
    fun getToolCallsForMessage(messageId: String): List<ToolCall> {
        val toolCallIds = messageToToolCalls[messageId] ?: return emptyList()
        return _toolCalls.filter { it.id in toolCallIds }
    }

    init {
        // 监听WebSocket消息
        viewModelScope.launch {
            webSocketManager.incomingMessages.collect { event ->
                event?.let { handleWebSocketEvent(it) }
            }
        }

        // 自动连接WebSocket
        connectWebSocket()
    }

    /**
     * 连接WebSocket
     */
    private fun connectWebSocket() {
        viewModelScope.launch {
            val token = tokenManager.getTokenSync()
            if (token != null) {
                webSocketManager.connect(token)
            }
        }
    }

    /**
     * 处理WebSocket事件 - 与Web端保持一致的事件处理逻辑
     */
    private fun handleWebSocketEvent(event: WebSocketManager.WebSocketEvent) {
        when (event) {
            is WebSocketManager.WebSocketEvent.MessageStart -> {
                // 创建新的AI消息占位符
                streamingMessageId = event.messageId
                val assistantMessage = Message(
                    id = event.messageId,
                    role = "assistant",
                    content = "",
                    timestamp = System.currentTimeMillis().toString(),
                    isStreaming = true
                )
                _messages.add(assistantMessage)
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "running",
                        currentTurn = event.iteration,
                        maxTurns = 20,
                        progress = 0
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.MessageDelta -> {
                // 更新流式消息内容
                streamingMessageId?.let { messageId ->
                    val index = _messages.indexOfFirst { it.id == messageId }
                    if (index != -1) {
                        val oldMessage = _messages[index]
                        _messages[index] = oldMessage.copy(
                            content = oldMessage.content + event.delta
                        )
                    }
                }
            }

            is WebSocketManager.WebSocketEvent.MessageStop -> {
                // 停止流式输出
                streamingMessageId?.let { messageId ->
                    val index = _messages.indexOfFirst { it.id == messageId }
                    if (index != -1) {
                        val oldMessage = _messages[index]
                        _messages[index] = oldMessage.copy(isStreaming = false)
                    }
                }
                streamingMessageId = null

                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = if (event.stopReason == "end_turn") "completed" else "running",
                        currentTurn = event.iteration,
                        maxTurns = 20,
                        progress = if (event.stopReason == "end_turn") 100 else 50
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.MessageSaved -> {
                // 消息已保存到服务器，更新本地消息ID以保持一致性
                if (event.role == "user") {
                    // 查找最后一条用户消息并更新其ID（如果ID不匹配）
                    val lastUserMsgIndex = _messages.indexOfLast { it.role == "user" }
                    if (lastUserMsgIndex != -1) {
                        val oldMsg = _messages[lastUserMsgIndex]
                        if (oldMsg.id != event.messageId) {
                            _messages[lastUserMsgIndex] = oldMsg.copy(id = event.messageId)
                        }
                    }
                }
            }

            // LLM流式输出时触发的工具使用事件
            is WebSocketManager.WebSocketEvent.ToolUse -> {
                // 创建新的工具调用记录，关联到当前流式消息
                val toolCall = ToolCall(
                    id = event.id,
                    toolName = event.name,
                    toolInput = emptyMap(),
                    toolOutput = null,
                    status = "pending",
                    createdAt = System.currentTimeMillis().toString()
                )
                _toolCalls.add(toolCall)
                pendingToolInput[event.id] = StringBuilder()
                
                // 将工具调用关联到当前流式消息
                streamingMessageId?.let { messageId ->
                    messageToToolCalls.getOrPut(messageId) { mutableListOf() }.add(event.id)
                }
            }

            // 工具输入参数增量更新
            is WebSocketManager.WebSocketEvent.ToolInputDelta -> {
                pendingToolInput[event.id]?.append(event.partialJson)
            }

            // 工具执行开始
            is WebSocketManager.WebSocketEvent.ToolStart -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    // 使用累积的输入参数或事件中的输入参数
                    val inputJson = pendingToolInput[event.id]?.toString()
                    val toolInput = if (!inputJson.isNullOrEmpty()) {
                        try {
                            val gson = com.google.gson.Gson()
                            @Suppress("UNCHECKED_CAST")
                            gson.fromJson(inputJson, Map::class.java) as? Map<String, Any> ?: emptyMap()
                        } catch (e: Exception) {
                            emptyMap()
                        }
                    } else {
                        emptyMap()
                    }
                    _toolCalls[index] = oldTool.copy(
                        status = "executing",
                        toolInput = toolInput
                    )
                }
            }

            // 工具执行完成
            is WebSocketManager.WebSocketEvent.ToolEnd -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    _toolCalls[index] = oldTool.copy(
                        status = "completed",
                        toolOutput = event.result,
                        completedAt = System.currentTimeMillis().toString()
                    )
                }
                // 清理pending输入
                pendingToolInput.remove(event.id)
            }

            // 工具执行失败
            is WebSocketManager.WebSocketEvent.ToolError -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    _toolCalls[index] = oldTool.copy(
                        status = "error",
                        error = event.error,
                        completedAt = System.currentTimeMillis().toString()
                    )
                }
                // 清理pending输入
                pendingToolInput.remove(event.id)
            }

            is WebSocketManager.WebSocketEvent.ConversationEnd -> {
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "completed",
                        currentTurn = 0,
                        maxTurns = 20,
                        progress = 100
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.Error -> {
                _uiState.value = UiState.Error(event.message)
            }
        }
    }

    /**
     * 发送消息并执行Agent（使用WebSocket流式输出）
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

                // 3. 使用WebSocket发送消息（支持流式输出）
                if (webSocketManager.isConnected) {
                    webSocketManager.sendUserMessage(
                        sessionId = session.id,
                        content = content
                    )
                } else {
                    // 降级到HTTP API
                    val result = chatRepository.executeAgent(
                        sessionId = session.id,
                        task = content,
                        prompt = content
                    )

                    result.fold(
                        onSuccess = { response ->
                            response.messages.forEach { msg ->
                                _messages.add(msg)
                            }
                            _toolCalls.clear()
                            _toolCalls.addAll(response.toolCalls)
                            _uiState.value = UiState.Success(
                                messages = _messages.toList(),
                                toolCalls = _toolCalls.toList(),
                                executionStatus = response.executionStatus
                            )
                        },
                        onFailure = { e ->
                            _uiState.value = UiState.Error(e.message ?: "发送消息失败")
                        }
                    )
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

                val result = chatRepository.getSessionDetail(sessionId)

                result.fold(
                    onSuccess = { detail ->
                        _messages.clear()
                        _messages.addAll(detail.messages)

                        _toolCalls.clear()
                        _toolCalls.addAll(detail.toolCalls)
                        
                        // 重建消息-工具调用映射
                        rebuildMessageToolCallMapping()

                        _uiState.value = UiState.Success(
                            messages = _messages.toList(),
                            toolCalls = _toolCalls.toList(),
                            executionStatus = null
                        )
                    },
                    onFailure = { e ->
                        _uiState.value = UiState.Error(e.message ?: "加载会话失败")
                    }
                )
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "加载失败")
            }
        }
    }
    
    /**
     * 重建消息-工具调用映射（用于从历史数据加载时）
     */
    private fun rebuildMessageToolCallMapping() {
        messageToToolCalls.clear()
        
        // 遍历工具调用，根据时间顺序关联到最近的助手消息
        var lastAssistantMessageId: String? = null
        for (message in _messages) {
            if (message.role == "assistant") {
                lastAssistantMessageId = message.id
                messageToToolCalls[message.id] = mutableListOf()
            }
        }
        
        // 将工具调用关联到它们出现后的第一个助手消息
        for (toolCall in _toolCalls) {
            val toolCallTime = toolCall.createdAt.toLongOrNull() ?: 0
            
            // 找到工具调用创建时间之前的最近一个助手消息
            var associatedMessageId: String? = null
            for (message in _messages) {
                if (message.role == "assistant") {
                    val messageTime = message.timestamp.toLongOrNull() ?: 0
                    if (messageTime <= toolCallTime) {
                        associatedMessageId = message.id
                    } else {
                        break
                    }
                }
            }
            
            // 如果找到关联的消息，添加工具调用
            if (associatedMessageId != null) {
                messageToToolCalls.getOrPut(associatedMessageId) { mutableListOf() }.add(toolCall.id)
            }
        }
    }

    /**
     * 中断Agent执行
     */
    fun abortExecution() {
        viewModelScope.launch {
            try {
                currentSessionId?.let { sessionId ->
                    webSocketManager.interruptGeneration(sessionId)
                }

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
            val result = chatRepository.createSession()
            result.fold(
                onSuccess = { session ->
                    currentSessionId = session.id
                    session
                },
                onFailure = { null }
            )
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

    override fun onCleared() {
        super.onCleared()
        webSocketManager.disconnect()
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
                    return ChatViewModel(chatRepository, tokenManager) as T
                }
            }
        }
    }
}

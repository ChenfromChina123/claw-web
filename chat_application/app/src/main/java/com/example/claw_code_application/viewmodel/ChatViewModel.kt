package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.data.websocket.WebSocketManager
import com.example.claw_code_application.ui.chat.components.shouldShowMessage
import com.google.gson.JsonPrimitive
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

    /** 缓存的Gson实例，避免在事件处理中重复创建 */
    private val gson = com.google.gson.Gson()

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

    /** 过滤后的可显示消息列表（缓存计算结果，避免重组时重复过滤） */
    val displayMessages: List<Message> by derivedStateOf {
        _messages.reversed().filter { shouldShowMessage(it) }
    }

    /** 工具调用列表 */
    private val _toolCalls = mutableStateListOf<ToolCall>()
    val toolCalls: List<ToolCall> = _toolCalls

    /** WebSocket连接状态 */
    val connectionState = webSocketManager.connectionState

    /** 当前正在流式输出的消息ID */
    private var streamingMessageId: String? = null

    /** 当前正在累积工具输入参数的工具ID和参数 */
    private val pendingToolInput = mutableMapOf<String, StringBuilder>()

    /** 消息ID与工具调用ID的映射 */
    private val messageToToolCalls = mutableMapOf<String, MutableList<String>>()

    /** 未关联到任何消息的工具调用ID列表 */
    private val unassociatedToolCallIds = mutableListOf<String>()
    
    /** 获取与指定消息关联的工具调用列表 */
    fun getToolCallsForMessage(messageId: String): List<ToolCall> {
        val toolCallIds = messageToToolCalls[messageId]
        if (toolCallIds == null) {
            return emptyList()
        }
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

                // 关联之前暂存的未关联工具调用
                if (unassociatedToolCallIds.isNotEmpty()) {
                    val toolCallList = messageToToolCalls.getOrPut(event.messageId) { mutableListOf() }
                    toolCallList.addAll(unassociatedToolCallIds)
                    unassociatedToolCallIds.clear()
                }

                val assistantMessage = Message(
                    id = event.messageId,
                    role = "assistant",
                    content = JsonPrimitive(""),
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
                        // 使用 JsonPrimitive 包装字符串
                        val currentText = if (oldMessage.content.isJsonPrimitive) {
                            oldMessage.content.asString
                        } else ""
                        _messages[index] = oldMessage.copy(
                            content = JsonPrimitive(currentText + event.delta)
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
                } ?: run {
                    // streamingMessageId 为 null 时，暂存到未关联列表
                    // 等 MessageStart 事件到达后再关联
                    unassociatedToolCallIds.add(event.id)
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
                        toolOutput = normalizeToolOutput(event.result),
                        completedAt = System.currentTimeMillis().toString()
                    )
                }
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
                pendingToolInput.remove(event.id)
            }

            // 工具执行进度
            is WebSocketManager.WebSocketEvent.ToolProgress -> {
                // 进度事件暂不改变工具状态，仅用于日志
            }

            // 工具调用结束
            is WebSocketManager.WebSocketEvent.ToolUseEnd -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    val newStatus = if (event.error != null) "error" else "completed"
                    _toolCalls[index] = oldTool.copy(
                        status = newStatus,
                        toolOutput = event.output ?: oldTool.toolOutput,
                        error = event.error ?: oldTool.error,
                        completedAt = System.currentTimeMillis().toString()
                    )
                }
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
    fun sendMessage(content: String, imageAttachments: List<Map<String, String>>? = null) {
        viewModelScope.launch {
            val session = ensureSession() ?: run {
                _uiState.value = UiState.Error("无法创建会话")
                return@launch
            }

            try {
                val userMessage = Message(
                    id = UUID.randomUUID().toString(),
                    role = "user",
                    content = JsonPrimitive(content),
                    timestamp = System.currentTimeMillis().toString(),
                    isStreaming = false,
                    attachments = imageAttachments?.map {
                        ImageAttachment(
                            imageId = it["imageId"] ?: "",
                            type = "image",
                            mimeType = it["mimeType"]
                        )
                    }
                )
                _messages.add(userMessage)

                _uiState.value = UiState.Loading

                if (webSocketManager.isConnected) {
                    webSocketManager.sendUserMessage(
                        sessionId = session.id,
                        content = content,
                        imageAttachments = imageAttachments
                    )
                } else {
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
     * 改进算法：基于消息内容中的 tool_use 块关联工具调用
     */
    private fun rebuildMessageToolCallMapping() {
        messageToToolCalls.clear()

        // 策略1：从消息内容中提取 tool_use 块的 id 进行精确关联
        for (message in _messages) {
            if (message.role != "assistant") continue

            // 获取内容的字符串表示
            val contentStr = message.getContentAsString().trim()
            if (!contentStr.startsWith("[") && !contentStr.startsWith("{")) continue

            try {
                val toolUseIds = extractToolUseIdsFromContent(contentStr)
                if (toolUseIds.isNotEmpty()) {
                    messageToToolCalls[message.id] = toolUseIds.toMutableList()
                }
            } catch (e: Exception) {
                // 解析失败，跳过
            }
        }

        // 策略2：对于未关联的工具调用，按时间顺序关联到最近的助手消息
        val associatedIds = messageToToolCalls.values.flatten().toSet()
        val unassociated = _toolCalls.filter { it.id !in associatedIds }

        if (unassociated.isNotEmpty()) {
            var lastAssistantMessageId: String? = null
            for (message in _messages) {
                if (message.role == "assistant") {
                    lastAssistantMessageId = message.id
                }
            }

            for (toolCall in unassociated) {
                // 按时间找到工具调用之前的最近助手消息
                val toolCallTime = toolCall.createdAt.toLongOrNull() ?: 0
                var bestMessageId: String? = null

                for (message in _messages) {
                    if (message.role == "assistant") {
                        val messageTime = message.timestamp.toLongOrNull() ?: 0
                        if (messageTime <= toolCallTime) {
                            bestMessageId = message.id
                        } else {
                            break
                        }
                    }
                }

                if (bestMessageId == null) {
                    bestMessageId = lastAssistantMessageId
                }

                if (bestMessageId != null) {
                    messageToToolCalls.getOrPut(bestMessageId) { mutableListOf() }.add(toolCall.id)
                }
            }
        }
    }

    /**
     * 从消息内容中提取 tool_use 块的 id 列表
     */
    private fun extractToolUseIdsFromContent(content: String): List<String> {
        val ids = mutableListOf<String>()
        try {
            if (content.startsWith("[")) {
                val jsonArray = com.google.gson.JsonParser.parseString(content).asJsonArray
                for (element in jsonArray) {
                    if (element.isJsonObject) {
                        val obj = element.asJsonObject
                        if (obj.get("type")?.asString == "tool_use") {
                            obj.get("id")?.asString?.let { ids.add(it) }
                        }
                    }
                }
            } else if (content.startsWith("{")) {
                val jsonObj = com.google.gson.JsonParser.parseString(content).asJsonObject
                if (jsonObj.get("type")?.asString == "tool_use") {
                    jsonObj.get("id")?.asString?.let { ids.add(it) }
                }
            }
        } catch (_: Exception) {
        }
        return ids
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
     * 规范化工具输出格式（与Web端 useWebSocket.ts handleToolEnd 对齐）
     * 对象类型 → 直接保留
     * 其他类型 → 包装为 { value: raw }
     */
    private fun normalizeToolOutput(result: Any?): Any? {
        if (result == null) return null
        return when (result) {
            is Map<*, *> -> result
            is com.google.gson.JsonObject -> result
            else -> mapOf("value" to result)
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

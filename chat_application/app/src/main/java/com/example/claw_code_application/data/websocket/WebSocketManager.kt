package com.example.claw_code_application.data.websocket

import android.util.Log
import com.example.claw_code_application.data.api.models.AgentPushMessage
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.TaskStatusChangePayload
import com.example.claw_code_application.util.NetworkConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * WebSocket管理器（优化版）
 *
 * 微信架构思想：弱网无敌 + 重连极快
 * 1. 指数退避重连策略 - 快速恢复连接
 * 2. 连接状态分级 - 精确掌握连接状态
 * 3. 心跳自适应 - 根据网络质量调整心跳间隔
 * 4. 消息发送队列 - 断线期间消息不丢失
 */
class WebSocketManager {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val NORMAL_CLOSURE_STATUS = 1000

        // 重连配置
        private const val MAX_RETRY_COUNT = 10
        private const val BASE_RETRY_DELAY_MS = 1000L
        private const val MAX_RETRY_DELAY_MS = 60000L // 最大60秒

        // 心跳配置
        private const val HEARTBEAT_INTERVAL_NORMAL_MS = 30000L // 正常网络30秒
        private const val HEARTBEAT_INTERVAL_WEAK_MS = 45000L   // 弱网45秒
        private const val HEARTBEAT_TIMEOUT_MS = 10000L         // 心跳超时10秒
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(HEARTBEAT_INTERVAL_NORMAL_MS, TimeUnit.MILLISECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var webSocket: WebSocket? = null

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _incomingMessages = MutableStateFlow<WebSocketEvent?>(null)
    val incomingMessages: StateFlow<WebSocketEvent?> = _incomingMessages.asStateFlow()

    val isConnected: Boolean
        get() = _connectionState.value is ConnectionState.Connected

    private var currentToken: String? = null
    private var retryCount = 0
    private var reconnectJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // 消息发送队列（断线期间缓存消息）
    private val messageQueue = mutableListOf<PendingMessage>()
    private var messageQueueJob: Job? = null

    // 心跳管理
    private var heartbeatJob: Job? = null
    private var lastPongTime = 0L

    // 连接状态
    sealed class ConnectionState {
        data object Disconnected : ConnectionState()
        data object Connecting : ConnectionState()
        data object Reconnecting : ConnectionState()
        data class Connected(val connectionId: String) : ConnectionState()
        data class Error(val message: String, val retryCount: Int = 0) : ConnectionState()
    }

    // WebSocket事件
    sealed class WebSocketEvent {
        data class MessageStart(val messageId: String, val iteration: Int) : WebSocketEvent()
        data class MessageDelta(val messageId: String, val delta: String) : WebSocketEvent()
        data class MessageStop(val messageId: String, val stopReason: String, val iteration: Int) : WebSocketEvent()
        data class MessageSaved(val sessionId: String, val messageId: String, val role: String) : WebSocketEvent()

        data class ToolUse(val id: String, val name: String) : WebSocketEvent()
        data class ToolInputDelta(val id: String, val partialJson: String) : WebSocketEvent()
        data class ToolStart(val id: String, val name: String, val input: JsonElement?) : WebSocketEvent()
        data class ToolEnd(val id: String, val name: String, val result: JsonElement?, val success: Boolean, val duration: Long?) : WebSocketEvent()
        data class ToolError(val id: String, val name: String, val error: String, val errorType: String, val duration: Long?) : WebSocketEvent()
        data class ToolProgress(val id: String, val name: String, val output: String?) : WebSocketEvent()
        data class ToolUseEnd(val id: String, val output: JsonElement?, val error: String?) : WebSocketEvent()

        data class ConversationEnd(val totalMessages: Int) : WebSocketEvent()
        data class Error(val message: String) : WebSocketEvent()
        data class AgentPush(val message: AgentPushMessage) : WebSocketEvent()
        data class TaskStatusChanged(val payload: TaskStatusChangePayload) : WebSocketEvent()
    }

    // 待发送消息
    private data class PendingMessage(
        val type: String,
        val content: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    /**
     * 连接WebSocket
     *
     * @param token 认证Token
     */
    fun connect(token: String) {
        if (_connectionState.value is ConnectionState.Connecting ||
            _connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connecting or connected")
            return
        }

        currentToken = token
        retryCount = 0
        performConnect(token)
    }

    /**
     * 执行连接
     */
    private fun performConnect(token: String) {
        val isReconnect = retryCount > 0
        _connectionState.value = if (isReconnect) {
            ConnectionState.Reconnecting
        } else {
            ConnectionState.Connecting
        }

        val wsUrl = NetworkConfig.getWebSocketUrl()
        Log.i(TAG, "Connecting to WebSocket: $wsUrl (attempt ${retryCount + 1})")

        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                retryCount = 0
                lastPongTime = System.currentTimeMillis()

                // 发送登录消息
                val loginMessage = buildJsonObject {
                    put("type", "login")
                    put("token", token)
                }
                ws.send(loginMessage.toString())

                // 启动心跳
                startHeartbeat()

                // 发送队列中的消息
                flushMessageQueue()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closing: $code / $reason")
                ws.close(NORMAL_CLOSURE_STATUS, null)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closed: $code / $reason")
                stopHeartbeat()
                _connectionState.value = ConnectionState.Disconnected
                webSocket = null

                scheduleReconnectIfNeeded(code)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}")
                stopHeartbeat()
                _connectionState.value = ConnectionState.Error(
                    t.message ?: "连接失败",
                    retryCount
                )
                webSocket = null

                scheduleReconnectIfNeeded(null)
            }
        })
    }

    /**
     * 指数退避重连策略
     * 延迟 = min(基础延迟 * 2^重试次数, 最大延迟)
     */
    private fun scheduleReconnectIfNeeded(closeCode: Int?) {
        val token = currentToken ?: return

        // 正常关闭不重连
        if (closeCode == NORMAL_CLOSURE_STATUS) {
            Log.i(TAG, "Normal closure, not reconnecting")
            return
        }

        // 达到最大重试次数
        if (retryCount >= MAX_RETRY_COUNT) {
            Log.w(TAG, "Max retry count ($MAX_RETRY_COUNT) reached, giving up")
            _connectionState.value = ConnectionState.Error("连接失败，请检查网络后重试", retryCount)
            return
        }

        // 计算指数退避延迟
        val delayMs = min(
            BASE_RETRY_DELAY_MS * (1L shl retryCount),
            MAX_RETRY_DELAY_MS
        )
        retryCount++

        Log.i(TAG, "Scheduling reconnect in ${delayMs}ms (attempt $retryCount/$MAX_RETRY_COUNT)")

        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(delayMs)
            if (isActive) {
                Log.i(TAG, "Attempting reconnect (attempt $retryCount/$MAX_RETRY_COUNT)")
                performConnect(token)
            }
        }
    }

    /**
     * 启动心跳检测
     */
    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_NORMAL_MS)

                // 检查上次心跳响应时间
                val timeSinceLastPong = System.currentTimeMillis() - lastPongTime
                if (timeSinceLastPong > HEARTBEAT_INTERVAL_NORMAL_MS + HEARTBEAT_TIMEOUT_MS) {
                    Log.w(TAG, "Heartbeat timeout, connection may be dead")
                    // 强制重连
                    webSocket?.close(1001, "Heartbeat timeout")
                    return@launch
                }

                // 发送心跳
                val pingMessage = buildJsonObject {
                    put("type", "ping")
                    put("timestamp", System.currentTimeMillis())
                }
                webSocket?.send(pingMessage.toString())
            }
        }
    }

    /**
     * 停止心跳检测
     */
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        reconnectJob?.cancel()
        reconnectJob = null
        stopHeartbeat()
        retryCount = MAX_RETRY_COUNT
        webSocket?.close(NORMAL_CLOSURE_STATUS, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
        messageQueue.clear()
    }

    /**
     * 发送用户消息
     * 如果未连接，消息会进入队列等待发送
     */
    fun sendUserMessage(
        sessionId: String,
        content: String,
        model: String = "qwen-plus",
        imageAttachments: List<Map<String, String>>? = null
    ) {
        val message = buildJsonObject {
            put("type", "user_message")
            put("sessionId", sessionId)
            put("content", content)
            put("model", model)
            if (!imageAttachments.isNullOrEmpty()) {
                val attachmentsArray = buildJsonArray {
                    for (attachment in imageAttachments) {
                        add(buildJsonObject {
                            put("imageId", attachment["imageId"] ?: "")
                            put("type", "image")
                            attachment["mimeType"]?.let { put("mimeType", it) }
                        })
                    }
                }
                put("imageAttachments", attachmentsArray)
            }
        }

        val messageStr = message.toString()

        if (isConnected) {
            webSocket?.send(messageStr)
                ?: Log.e(TAG, "Cannot send message: WebSocket not connected")
        } else {
            // 未连接时加入队列
            messageQueue.add(PendingMessage("user_message", messageStr))
            Log.w(TAG, "WebSocket not connected, message queued. Queue size: ${messageQueue.size}")
        }
    }

    /**
     * 中断生成
     */
    fun interruptGeneration(sessionId: String) {
        val message = buildJsonObject {
            put("type", "interrupt_generation")
            put("sessionId", sessionId)
        }

        if (isConnected) {
            webSocket?.send(message.toString())
        } else {
            Log.w(TAG, "Cannot interrupt: WebSocket not connected")
        }
    }

    /**
     * 刷新消息队列（连接成功后发送）
     */
    private fun flushMessageQueue() {
        if (messageQueue.isEmpty()) return

        Log.i(TAG, "Flushing message queue: ${messageQueue.size} messages")

        messageQueueJob?.cancel()
        messageQueueJob = scope.launch {
            // 复制队列并清空
            val messagesToSend = messageQueue.toList()
            messageQueue.clear()

            messagesToSend.forEach { pendingMessage ->
                if (isActive && isConnected) {
                    webSocket?.send(pendingMessage.content)
                    delay(100) // 间隔发送，避免拥塞
                } else {
                    // 连接断开，重新加入队列
                    messageQueue.add(pendingMessage)
                    return@launch
                }
            }

            Log.i(TAG, "Message queue flushed successfully")
        }
    }

    /**
     * 处理收到的消息
     */
    private fun handleMessage(text: String) {
        try {
            val jsonElement = json.parseToJsonElement(text)
            val jsonObject = jsonElement.jsonObject
            val type = jsonObject["type"]?.jsonPrimitive?.content

            when (type) {
                "connected" -> {
                    val connectionId = jsonObject["connectionId"]?.jsonPrimitive?.content ?: ""
                    _connectionState.value = ConnectionState.Connected(connectionId)
                }

                "logged_in" -> {
                    Log.i(TAG, "User logged in via WebSocket")
                }

                "event" -> {
                    val event = jsonObject["event"]?.jsonPrimitive?.content
                    val data = jsonObject["data"]?.jsonObject
                    handleEvent(event, data)
                }

                "pong" -> {
                    // 心跳响应
                    lastPongTime = System.currentTimeMillis()
                    Log.d(TAG, "Received pong from server")
                }

                "ping" -> {
                    // 服务器心跳检测，回复pong
                    val pongMessage = buildJsonObject {
                        put("type", "pong")
                        put("timestamp", System.currentTimeMillis())
                    }
                    webSocket?.send(pongMessage.toString())
                }

                "error" -> {
                    val errorMessage = jsonObject["message"]?.jsonPrimitive?.content ?: "Unknown error"
                    Log.e(TAG, "Server error: $errorMessage")
                    _incomingMessages.value = WebSocketEvent.Error(errorMessage)
                }

                else -> {
                    Log.d(TAG, "Unknown message type: $type")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse message: ${e.message}")
        }
    }

    /**
     * 处理事件
     */
    private fun handleEvent(event: String?, data: JsonObject?) {
        if (event == null || data == null) return

        Log.d(TAG, "=== WebSocket Event: $event ===")
        Log.d(TAG, "Event data: ${data.toString().take(200)}")

        val webSocketEvent = when (event) {
            "message_start" -> {
                val messageId = data["messageId"]?.jsonPrimitive?.content ?: ""
                val iteration = data["iteration"]?.jsonPrimitive?.int ?: 0
                WebSocketEvent.MessageStart(messageId, iteration)
            }

            "message_delta" -> {
                val messageId = data["messageId"]?.jsonPrimitive?.content ?: ""
                val delta = data["delta"]?.jsonPrimitive?.content ?: ""
                WebSocketEvent.MessageDelta(messageId, delta)
            }

            "content_block_delta" -> {
                val text = data["text"]?.jsonPrimitive?.content ?: ""
                WebSocketEvent.MessageDelta("", text)
            }

            "message_stop" -> {
                val messageId = data["messageId"]?.jsonPrimitive?.content ?: ""
                val stopReason = data["stop_reason"]?.jsonPrimitive?.content ?: ""
                val iteration = data["iteration"]?.jsonPrimitive?.int ?: 0
                WebSocketEvent.MessageStop(messageId, stopReason, iteration)
            }

            "message_saved" -> {
                val sessionId = data["sessionId"]?.jsonPrimitive?.content ?: ""
                val messageId = data["messageId"]?.jsonPrimitive?.content ?: ""
                val role = data["role"]?.jsonPrimitive?.content ?: ""
                WebSocketEvent.MessageSaved(sessionId, messageId, role)
            }

            "tool_use" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val name = data["name"]?.jsonPrimitive?.content ?: ""
                WebSocketEvent.ToolUse(id, name)
            }

            "tool_input_delta" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val partialJson = data["partial_json"]?.jsonPrimitive?.content ?: ""
                WebSocketEvent.ToolInputDelta(id, partialJson)
            }

            "tool_start" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val name = data["name"]?.jsonPrimitive?.content ?: ""
                val input = data["input"]
                WebSocketEvent.ToolStart(id, name, input)
            }

            "tool_end" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val name = data["name"]?.jsonPrimitive?.content ?: ""
                val result = data["result"]
                val success = data["success"]?.jsonPrimitive?.boolean ?: true
                val duration = data["duration"]?.jsonPrimitive?.long
                WebSocketEvent.ToolEnd(id, name, result, success, duration)
            }

            "tool_error" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val name = data["name"]?.jsonPrimitive?.content ?: ""
                val error = data["error"]?.jsonPrimitive?.content ?: "Unknown error"
                val errorType = data["errorType"]?.jsonPrimitive?.content ?: "UNKNOWN"
                val duration = data["duration"]?.jsonPrimitive?.long
                WebSocketEvent.ToolError(id, name, error, errorType, duration)
            }

            "tool_progress" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: data["executionId"]?.jsonPrimitive?.content ?: ""
                val name = data["name"]?.jsonPrimitive?.content ?: ""
                val output = data["output"]?.jsonPrimitive?.content
                WebSocketEvent.ToolProgress(id, name, output)
            }

            "tool_use_end" -> {
                val id = data["id"]?.jsonPrimitive?.content ?: ""
                val output = data["output"] ?: data["result"]
                val error = data["error"]?.jsonPrimitive?.content
                WebSocketEvent.ToolUseEnd(id, output, error)
            }

            "conversation_end" -> {
                val totalMessages = data["totalMessages"]?.jsonPrimitive?.int ?: 0
                WebSocketEvent.ConversationEnd(totalMessages)
            }

            "error" -> {
                val message = data["message"]?.jsonPrimitive?.content ?: "Unknown error"
                WebSocketEvent.Error(message)
            }

            "agent_push" -> {
                try {
                    val pushMessage = json.decodeFromJsonElement(AgentPushMessage.serializer(), data)
                    WebSocketEvent.AgentPush(pushMessage)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse agent_push message: ${e.message}")
                    return
                }
            }

            "task_status_changed" -> {
                try {
                    val payload = json.decodeFromJsonElement(TaskStatusChangePayload.serializer(), data)
                    WebSocketEvent.TaskStatusChanged(payload)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse task_status_changed: ${e.message}")
                    return
                }
            }

            else -> {
                Log.d(TAG, "Unknown event type: $event")
                return
            }
        }

        _incomingMessages.value = webSocketEvent
    }
}

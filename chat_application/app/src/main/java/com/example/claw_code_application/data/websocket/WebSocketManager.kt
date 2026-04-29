package com.example.claw_code_application.data.websocket

import android.util.Log
import com.example.claw_code_application.data.api.models.AgentPushMessage
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.util.NetworkConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketManager {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val NORMAL_CLOSURE_STATUS = 1000
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
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
    private val maxRetryCount = 5
    private val baseRetryDelayMs = 1000L
    private val maxRetryDelayMs = 30000L
    private var reconnectJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    sealed class ConnectionState {
        data object Disconnected : ConnectionState()
        data object Connecting : ConnectionState()
        data class Connected(val connectionId: String) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

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
    }

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

    private fun performConnect(token: String) {
        _connectionState.value = ConnectionState.Connecting

        val wsUrl = NetworkConfig.getWebSocketUrl()

        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                retryCount = 0

                val loginMessage = buildJsonObject {
                    put("type", "login")
                    put("token", token)
                }
                ws.send(loginMessage.toString())
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
                _connectionState.value = ConnectionState.Disconnected
                webSocket = null

                scheduleReconnectIfNeeded(code)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}")
                _connectionState.value = ConnectionState.Error(t.message ?: "连接失败")
                webSocket = null

                scheduleReconnectIfNeeded(null)
            }
        })
    }

    private fun scheduleReconnectIfNeeded(closeCode: Int?) {
        val token = currentToken ?: return

        if (closeCode == NORMAL_CLOSURE_STATUS) {
            Log.i(TAG, "Normal closure, not reconnecting")
            return
        }

        if (retryCount >= maxRetryCount) {
            Log.w(TAG, "Max retry count ($maxRetryCount) reached, giving up")
            return
        }

        val delayMs = minOf(baseRetryDelayMs * (1L shl retryCount), maxRetryDelayMs)
        retryCount++

        Log.i(TAG, "Scheduling reconnect in ${delayMs}ms (attempt $retryCount/$maxRetryCount)")

        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(delayMs)
            Log.i(TAG, "Attempting reconnect (attempt $retryCount/$maxRetryCount)")
            performConnect(token)
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        reconnectJob = null
        retryCount = maxRetryCount
        webSocket?.close(NORMAL_CLOSURE_STATUS, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }

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
        webSocket?.send(message.toString())
            ?: Log.e(TAG, "Cannot send message: WebSocket not connected")
    }

    fun interruptGeneration(sessionId: String) {
        val message = buildJsonObject {
            put("type", "interrupt_generation")
            put("sessionId", sessionId)
        }
        webSocket?.send(message.toString())
    }

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

                "ping" -> {
                    // 服务器心跳检测，无需处理
                    Log.d(TAG, "Received ping from server")
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
                // Anthropic SDK 原始事件，转换为 message_delta 格式
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

            else -> {
                Log.d(TAG, "Unknown event type: $event")
                return
            }
        }

        _incomingMessages.value = webSocketEvent
    }
}
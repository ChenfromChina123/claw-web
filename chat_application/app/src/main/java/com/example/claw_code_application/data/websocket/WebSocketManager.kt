package com.example.claw_code_application.data.websocket

import android.util.Log
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.util.NetworkConfig
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.*
import java.util.concurrent.TimeUnit

/**
 * WebSocket 连接管理器
 * 负责与后端 WebSocket 建立连接、发送消息、接收流式响应
 */
class WebSocketManager {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val NORMAL_CLOSURE_STATUS = 1000
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val gson = Gson()

    /** 连接状态 */
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    /** 收到的消息流 */
    private val _incomingMessages = MutableStateFlow<WebSocketEvent?>(null)
    val incomingMessages: StateFlow<WebSocketEvent?> = _incomingMessages.asStateFlow()

    /** 是否已连接 */
    val isConnected: Boolean
        get() = _connectionState.value is ConnectionState.Connected

    /**
     * 连接状态密封类
     */
    sealed class ConnectionState {
        data object Disconnected : ConnectionState()
        data object Connecting : ConnectionState()
        data class Connected(val connectionId: String) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

    /** WebSocket 事件密封类 - 与后端事件名称保持一致 */
    sealed class WebSocketEvent {
        data class MessageStart(val messageId: String, val iteration: Int) : WebSocketEvent()
        data class MessageDelta(val messageId: String, val delta: String) : WebSocketEvent()
        data class MessageStop(val messageId: String, val stopReason: String, val iteration: Int) : WebSocketEvent()
        data class MessageSaved(val sessionId: String, val messageId: String, val role: String) : WebSocketEvent()
        
        /** 工具使用事件（LLM 流式输出时触发） */
        data class ToolUse(val id: String, val name: String) : WebSocketEvent()
        
        /** 工具输入增量事件（流式参数接收） */
        data class ToolInputDelta(val id: String, val partialJson: String) : WebSocketEvent()
        
        /** 工具执行开始事件 */
        data class ToolStart(val id: String, val name: String, val input: Any?) : WebSocketEvent()
        
        /** 工具执行完成事件 */
        data class ToolEnd(val id: String, val name: String, val result: Any?, val success: Boolean, val duration: Long?) : WebSocketEvent()
        
        /** 工具执行失败事件 */
        data class ToolError(val id: String, val name: String, val error: String, val errorType: String, val duration: Long?) : WebSocketEvent()

        /** 工具执行进度事件（与Web端 tool_progress 对齐） */
        data class ToolProgress(val id: String, val name: String, val output: String?) : WebSocketEvent()

        /** 工具调用结束事件（与Web端 tool_use_end 对齐） */
        data class ToolUseEnd(val id: String, val output: Any?, val error: String?) : WebSocketEvent()
        
        data class ConversationEnd(val totalMessages: Int) : WebSocketEvent()
        data class Error(val message: String) : WebSocketEvent()
    }

    /**
     * 连接到 WebSocket 服务器
     * @param token 用户认证token
     */
    fun connect(token: String) {
        if (_connectionState.value is ConnectionState.Connecting ||
            _connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connecting or connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting

        // 使用 NetworkConfig 获取 WebSocket URL（自动转换协议）
        val wsUrl = NetworkConfig.getWebSocketUrl()

        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                // 发送登录消息
                val loginMessage = JsonObject().apply {
                    addProperty("type", "login")
                    addProperty("token", token)
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
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}")
                _connectionState.value = ConnectionState.Error(t.message ?: "连接失败")
                webSocket = null
            }
        })
    }

    /**
     * 断开 WebSocket 连接
     */
    fun disconnect() {
        webSocket?.close(NORMAL_CLOSURE_STATUS, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }

    /**
     * 发送用户消息（使用 WebSocket 流式输出）
     * 支持图片附件
     */
    fun sendUserMessage(
        sessionId: String,
        content: String,
        model: String = "qwen-plus",
        imageAttachments: List<Map<String, String>>? = null
    ) {
        val message = JsonObject().apply {
            addProperty("type", "user_message")
            addProperty("sessionId", sessionId)
            addProperty("content", content)
            addProperty("model", model)
            if (!imageAttachments.isNullOrEmpty()) {
                val attachmentsArray = com.google.gson.JsonArray()
                for (attachment in imageAttachments) {
                    val obj = JsonObject().apply {
                        addProperty("imageId", attachment["imageId"] ?: "")
                        addProperty("type", "image")
                        attachment["mimeType"]?.let { addProperty("mimeType", it) }
                    }
                    attachmentsArray.add(obj)
                }
                add("imageAttachments", attachmentsArray)
            }
        }
        webSocket?.send(message.toString())
            ?: Log.e(TAG, "Cannot send message: WebSocket not connected")
    }

    /**
     * 中断当前生成
     */
    fun interruptGeneration(sessionId: String) {
        val message = JsonObject().apply {
            addProperty("type", "interrupt_generation")
            addProperty("sessionId", sessionId)
        }
        webSocket?.send(message.toString())
    }

    /**
     * 处理收到的 WebSocket 消息
     */
    private fun handleMessage(text: String) {
        try {
            val json = gson.fromJson(text, JsonObject::class.java)
            val type = json.get("type")?.asString

            when (type) {
                "connected" -> {
                    val connectionId = json.get("connectionId")?.asString ?: ""
                    _connectionState.value = ConnectionState.Connected(connectionId)
                }

                "logged_in" -> {
                    Log.i(TAG, "User logged in via WebSocket")
                }

                "event" -> {
                    val event = json.get("event")?.asString
                    val data = json.getAsJsonObject("data")
                    handleEvent(event, data)
                }

                "error" -> {
                    val errorMessage = json.get("message")?.asString ?: "Unknown error"
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
     * 处理服务器发送的事件
     */
    private fun handleEvent(event: String?, data: JsonObject?) {
        if (event == null || data == null) return

        Log.d(TAG, "=== WebSocket Event: $event ===")
        Log.d(TAG, "Event data: ${data.toString().take(200)}")

        val webSocketEvent = when (event) {
            "message_start" -> {
                val messageId = data.get("messageId")?.asString ?: ""
                val iteration = data.get("iteration")?.asInt ?: 0
                WebSocketEvent.MessageStart(messageId, iteration)
            }

            "message_delta" -> {
                val messageId = data.get("messageId")?.asString ?: ""
                val delta = data.get("delta")?.asString ?: ""
                WebSocketEvent.MessageDelta(messageId, delta)
            }

            "message_stop" -> {
                val messageId = data.get("messageId")?.asString ?: ""
                val stopReason = data.get("stop_reason")?.asString ?: ""
                val iteration = data.get("iteration")?.asInt ?: 0
                WebSocketEvent.MessageStop(messageId, stopReason, iteration)
            }

            "message_saved" -> {
                val sessionId = data.get("sessionId")?.asString ?: ""
                val messageId = data.get("messageId")?.asString ?: ""
                val role = data.get("role")?.asString ?: ""
                WebSocketEvent.MessageSaved(sessionId, messageId, role)
            }

            "tool_use" -> {
                val id = data.get("id")?.asString ?: ""
                val name = data.get("name")?.asString ?: ""
                WebSocketEvent.ToolUse(id, name)
            }

            "tool_input_delta" -> {
                val id = data.get("id")?.asString ?: ""
                val partialJson = data.get("partial_json")?.asString ?: ""
                WebSocketEvent.ToolInputDelta(id, partialJson)
            }

            "tool_start" -> {
                val id = data.get("id")?.asString ?: ""
                val name = data.get("name")?.asString ?: ""
                val input = data.get("input")
                WebSocketEvent.ToolStart(id, name, input)
            }

            "tool_end" -> {
                val id = data.get("id")?.asString ?: ""
                val name = data.get("name")?.asString ?: ""
                val result = data.get("result")
                val success = data.get("success")?.asBoolean ?: true
                val duration = data.get("duration")?.asLong
                WebSocketEvent.ToolEnd(id, name, result, success, duration)
            }

            "tool_error" -> {
                val id = data.get("id")?.asString ?: ""
                val name = data.get("name")?.asString ?: ""
                val error = data.get("error")?.asString ?: "Unknown error"
                val errorType = data.get("errorType")?.asString ?: "UNKNOWN"
                val duration = data.get("duration")?.asLong
                WebSocketEvent.ToolError(id, name, error, errorType, duration)
            }

            "tool_progress" -> {
                val id = data.get("id")?.asString ?: data.get("executionId")?.asString ?: ""
                val name = data.get("name")?.asString ?: ""
                val output = data.get("output")?.asString
                WebSocketEvent.ToolProgress(id, name, output)
            }

            "tool_use_end" -> {
                val id = data.get("id")?.asString ?: ""
                val output = data.get("output") ?: data.get("result")
                val error = data.get("error")?.asString
                WebSocketEvent.ToolUseEnd(id, output, error)
            }

            "conversation_end" -> {
                val totalMessages = data.get("totalMessages")?.asInt ?: 0
                WebSocketEvent.ConversationEnd(totalMessages)
            }

            "error" -> {
                val message = data.get("message")?.asString ?: "Unknown error"
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

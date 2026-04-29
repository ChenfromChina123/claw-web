package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Immutable
@Serializable
data class Session(
    val id: String,
    val title: String? = null,
    val model: String? = "qwen-plus",
    @SerialName("userId")
    val userId: String? = null,
    @SerialName("isPinned")
    val isPinned: Boolean = false,
    @SerialName("createdAt")
    val createdAt: String,
    @SerialName("updatedAt")
    val updatedAt: String,
    @SerialName("lastMessage")
    val lastMessage: String? = null,
    @SerialName("isRunning")
    val isRunning: Boolean = false,
    /**
     * 标记是否是仅本地存在的临时会话
     * 用于懒创建会话模式：用户点击新建会话时只在客户端创建，
     * 发送第一条消息时才真正在后端创建
     */
    @SerialName("isLocalOnly")
    val isLocalOnly: Boolean = false
) {
    /**
     * 获取非空标题，如果为null则返回默认值
     */
    fun getTitleOrDefault(): String = title ?: "新对话"

    /**
     * 获取非空模型，如果为null则返回默认值
     */
    fun getModelOrDefault(): String = model ?: "qwen-plus"
}

@Serializable
data class CreateSessionRequest(
    val title: String? = null,
    val model: String = "qwen-plus"
)

/**
 * 更新会话请求
 * 用于重命名、置顶/取消置顶等操作
 */
@Serializable
data class UpdateSessionRequest(
    val title: String? = null,
    val model: String? = null,
    @SerialName("isPinned")
    val isPinned: Boolean? = null
)

@Serializable
data class SessionDetail(
    val session: Session,
    val messages: List<Message>,
    val toolCalls: List<ToolCall>
)
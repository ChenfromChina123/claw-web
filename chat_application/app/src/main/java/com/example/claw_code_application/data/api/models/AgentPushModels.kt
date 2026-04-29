package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Agent 推送消息模型
 * 用于接收后端推送的隐私信息、通知等
 */
@Immutable
@Serializable
data class AgentPushMessage(
    val id: String,
    val type: String = "agent_push",
    val category: PushCategory,
    val title: String,
    val content: String,
    @SerialName("sensitiveData")
    val sensitiveData: SensitiveData? = null,
    @SerialName("sessionId")
    val sessionId: String,
    @SerialName("userId")
    val userId: String? = null,
    val timestamp: String,
    @SerialName("expiresAt")
    val expiresAt: String? = null,
    val priority: PushPriority
)

/**
 * 推送类别枚举
 */
@Serializable
enum class PushCategory {
    @SerialName("credential")
    CREDENTIAL,    // 凭证信息（账号密码）

    @SerialName("notification")
    NOTIFICATION,  // 普通通知

    @SerialName("alert")
    ALERT,         // 警告

    @SerialName("info")
    INFO           // 一般信息
}

/**
 * 推送优先级枚举
 */
@Serializable
enum class PushPriority {
    @SerialName("low")
    LOW,

    @SerialName("normal")
    NORMAL,

    @SerialName("high")
    HIGH,

    @SerialName("urgent")
    URGENT
}

/**
 * 敏感数据模型
 * 包含账号密码等隐私信息
 */
@Immutable
@Serializable
data class SensitiveData(
    val username: String? = null,
    val password: String? = null,
    val token: String? = null,
    @SerialName("apiKey")
    val apiKey: String? = null,
    @SerialName("extraData")
    val extraData: Map<String, String>? = null
)

/**
 * 凭证信息包装类
 * 用于安全显示和处理凭证数据
 */
@Immutable
data class CredentialInfo(
    val id: String,
    val title: String,
    val username: String,
    val password: String,
    val service: String? = null,
    val note: String? = null,
    val timestamp: String,
    val expiresAt: String? = null
)

/**
 * 将 AgentPushMessage 转换为 CredentialInfo
 */
fun AgentPushMessage.toCredentialInfo(): CredentialInfo? {
    if (category != PushCategory.CREDENTIAL || sensitiveData == null) {
        return null
    }

    return CredentialInfo(
        id = id,
        title = title,
        username = sensitiveData.username ?: "",
        password = sensitiveData.password ?: "",
        service = sensitiveData.extraData?.get("service"),
        note = sensitiveData.extraData?.get("note"),
        timestamp = timestamp,
        expiresAt = expiresAt
    )
}

/**
 * 检查推送消息是否已过期
 */
fun AgentPushMessage.isExpired(): Boolean {
    if (expiresAt == null) return false
    return try {
        val expireTime = java.time.Instant.parse(expiresAt)
        java.time.Instant.now().isAfter(expireTime)
    } catch (e: Exception) {
        false
    }
}

/**
 * 获取推送消息的优先级级别（用于通知重要性）
 */
fun PushPriority.toImportance(): Int {
    return when (this) {
        PushPriority.LOW -> android.app.NotificationManager.IMPORTANCE_LOW
        PushPriority.NORMAL -> android.app.NotificationManager.IMPORTANCE_DEFAULT
        PushPriority.HIGH -> android.app.NotificationManager.IMPORTANCE_HIGH
        PushPriority.URGENT -> android.app.NotificationManager.IMPORTANCE_HIGH
    }
}

package com.example.claw_code_application.data.local.db

import com.example.claw_code_application.data.api.models.ImageAttachment
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.api.models.SessionDetail
import com.example.claw_code_application.data.api.models.ToolCall
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * 数据库实体与API模型之间的转换扩展函数
 */
object EntityMappers {
    private val gson = Gson()

    // ==================== Session 转换 ====================

    /**
     * Session -> SessionEntity
     */
    fun Session.toEntity(): SessionEntity {
        return SessionEntity(
            id = id,
            title = title,
            model = model,
            userId = userId,
            isPinned = isPinned,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    /**
     * SessionEntity -> Session
     */
    fun SessionEntity.toSession(): Session {
        return Session(
            id = id,
            title = title,
            model = model,
            userId = userId,
            isPinned = isPinned,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    /**
     * List<Session> -> List<SessionEntity>
     */
    fun List<Session>.toSessionEntities(): List<SessionEntity> {
        return map { it.toEntity() }
    }

    /**
     * List<SessionEntity> -> List<Session>
     */
    fun List<SessionEntity>.toSessions(): List<Session> {
        return map { it.toSession() }
    }

    // ==================== Message 转换 ====================

    /**
     * Message -> MessageEntity
     */
    fun Message.toEntity(sessionId: String): MessageEntity {
        return MessageEntity(
            id = id,
            sessionId = sessionId,
            role = role,
            content = content,
            timestamp = timestamp,
            isStreaming = isStreaming,
            attachmentsJson = attachments?.let { serializeAttachments(it) }
        )
    }

    /**
     * MessageEntity -> Message
     */
    fun MessageEntity.toMessage(): Message {
        return Message(
            id = id,
            role = role,
            content = content,
            timestamp = timestamp,
            isStreaming = isStreaming,
            attachments = attachmentsJson?.let { deserializeAttachments(it) }
        )
    }

    /**
     * List<Message> -> List<MessageEntity>
     */
    fun List<Message>.toMessageEntities(sessionId: String): List<MessageEntity> {
        return map { it.toEntity(sessionId) }
    }

    /**
     * List<MessageEntity> -> List<Message>
     */
    fun List<MessageEntity>.toMessages(): List<Message> {
        return map { it.toMessage() }
    }

    // ==================== ToolCall 转换 ====================

    /**
     * ToolCall -> ToolCallEntity
     */
    fun ToolCall.toEntity(sessionId: String, messageId: String?): ToolCallEntity {
        return ToolCallEntity(
            id = id,
            sessionId = sessionId,
            messageId = messageId,
            toolName = toolName,
            toolInputJson = serializeToolInput(toolInput),
            toolOutputJson = toolOutput?.let { serializeToolOutput(it) },
            status = status,
            error = error,
            createdAt = createdAt,
            completedAt = completedAt
        )
    }

    /**
     * ToolCallEntity -> ToolCall
     */
    fun ToolCallEntity.toToolCall(): ToolCall {
        return ToolCall(
            id = id,
            messageId = messageId,
            sessionId = sessionId,
            toolName = toolName,
            toolInput = deserializeToolInput(toolInputJson),
            toolOutput = toolOutputJson?.let { deserializeToolOutput(it) },
            status = status,
            error = error,
            createdAt = createdAt,
            completedAt = completedAt
        )
    }

    /**
     * List<ToolCall> -> List<ToolCallEntity>
     */
    fun List<ToolCall>.toToolCallEntities(sessionId: String, messageId: String?): List<ToolCallEntity> {
        return map { it.toEntity(sessionId, messageId) }
    }

    /**
     * List<ToolCallEntity> -> List<ToolCall>
     */
    fun List<ToolCallEntity>.toToolCalls(): List<ToolCall> {
        return map { it.toToolCall() }
    }

    // ==================== SessionDetail 转换 ====================

    /**
     * SessionDetail -> 缓存数据（包含Session、Messages、ToolCalls）
     */
    fun SessionDetail.toCacheData(): Triple<SessionEntity, List<MessageEntity>, List<ToolCallEntity>> {
        val sessionEntity = session.toEntity()
        val messageEntities = messages.map { it.toEntity(session.id) }
        val toolCallEntities = toolCalls.map { toolCall ->
            val messageId = findMessageIdForToolCall(toolCall, messages)
            toolCall.toEntity(session.id, messageId)
        }
        return Triple(sessionEntity, messageEntities, toolCallEntities)
    }

    /**
     * 根据 toolCalls 和 messages 找到工具调用对应的 messageId
     */
    private fun findMessageIdForToolCall(toolCall: ToolCall, messages: List<Message>): String? {
        return messages.find { message ->
            message.toolCalls?.any { it.id == toolCall.id } == true
        }?.id
    }

    // ==================== 辅助方法 ====================

    /**
     * 序列化工具输入参数
     */
    private fun serializeToolInput(input: Map<String, Any>): String {
        return gson.toJson(input)
    }

    /**
     * 反序列化工具输入参数
     */
    @Suppress("UNCHECKED_CAST")
    private fun deserializeToolInput(json: String): Map<String, Any> {
        return try {
            val type = object : TypeToken<Map<String, Any>>() {}.type
            gson.fromJson(json, type) ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }

    /**
     * 序列化工具输出
     */
    private fun serializeToolOutput(output: Any?): String {
        return gson.toJson(output)
    }

    /**
     * 反序列化工具输出
     */
    private fun deserializeToolOutput(json: String): Any? {
        return try {
            gson.fromJson(json, Any::class.java)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 序列化附件列表
     */
    private fun serializeAttachments(attachments: List<ImageAttachment>): String {
        return gson.toJson(attachments)
    }

    /**
     * 反序列化附件列表
     */
    private fun deserializeAttachments(json: String): List<ImageAttachment>? {
        return try {
            val type = object : TypeToken<List<ImageAttachment>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            null
        }
    }
}

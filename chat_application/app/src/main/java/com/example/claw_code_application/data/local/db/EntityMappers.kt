package com.example.claw_code_application.data.local.db

import com.example.claw_code_application.data.api.models.ImageAttachment
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.api.models.SessionDetail
import com.example.claw_code_application.data.api.models.ToolCall
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object EntityMappers {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun Session.toEntity(): SessionEntity {
        return SessionEntity(
            id = id,
            title = title ?: "新对话",
            model = model ?: "qwen-plus",
            userId = userId,
            isPinned = isPinned,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lastMessage = lastMessage,
            isRunning = isRunning
        )
    }

    fun SessionEntity.toSession(): Session {
        return Session(
            id = id,
            title = title,
            model = model,
            userId = userId,
            isPinned = isPinned,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lastMessage = lastMessage,
            isRunning = isRunning
        )
    }

    fun List<Session>.toSessionEntities(): List<SessionEntity> {
        return map { it.toEntity() }
    }

    fun List<SessionEntity>.toSessions(): List<Session> {
        return map { it.toSession() }
    }

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

    fun List<Message>.toMessageEntities(sessionId: String): List<MessageEntity> {
        return map { it.toEntity(sessionId) }
    }

    fun List<MessageEntity>.toMessages(): List<Message> {
        return map { it.toMessage() }
    }

    fun ToolCall.toEntity(sessionId: String, messageId: String?): ToolCallEntity {
        return ToolCallEntity(
            id = id,
            sessionId = sessionId,
            messageId = messageId,
            toolName = toolName,
            toolInputJson = json.encodeToString(toolInput),
            toolOutputJson = toolOutput?.let { json.encodeToString(JsonElement.serializer(), it) },
            status = status,
            error = error,
            createdAt = createdAt,
            completedAt = completedAt
        )
    }

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

    fun List<ToolCall>.toToolCallEntities(sessionId: String, messageId: String?): List<ToolCallEntity> {
        return map { it.toEntity(sessionId, messageId) }
    }

    fun List<ToolCallEntity>.toToolCalls(): List<ToolCall> {
        return map { it.toToolCall() }
    }

    fun SessionDetail.toCacheData(): Triple<SessionEntity, List<MessageEntity>, List<ToolCallEntity>> {
        val sessionEntity = session.toEntity()
        val messageEntities = messages.map { it.toEntity(session.id) }
        val toolCallEntities = toolCalls.map { toolCall ->
            val messageId = findMessageIdForToolCall(toolCall, messages)
            toolCall.toEntity(session.id, messageId)
        }
        return Triple(sessionEntity, messageEntities, toolCallEntities)
    }

    private fun findMessageIdForToolCall(toolCall: ToolCall, messages: List<Message>): String? {
        return messages.find { message ->
            message.toolCalls?.any { it.id == toolCall.id } == true
        }?.id
    }

    private fun serializeToolInput(input: JsonObject): String {
        return json.encodeToString(input)
    }

    private fun deserializeToolInput(jsonStr: String): JsonObject {
        return try {
            json.parseToJsonElement(jsonStr).jsonObject
        } catch (e: Exception) {
            JsonObject(emptyMap())
        }
    }

    private fun deserializeToolOutput(jsonStr: String): JsonElement {
        return try {
            json.parseToJsonElement(jsonStr)
        } catch (e: Exception) {
            kotlinx.serialization.json.JsonPrimitive(jsonStr)
        }
    }

    private fun serializeAttachments(attachments: List<ImageAttachment>): String {
        return json.encodeToString(attachments)
    }

    private fun deserializeAttachments(jsonStr: String): List<ImageAttachment>? {
        return try {
            json.decodeFromString<List<ImageAttachment>>(jsonStr)
        } catch (e: Exception) {
            null
        }
    }
}
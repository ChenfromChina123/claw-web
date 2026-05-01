package com.example.claw_code_application.viewmodel

import com.example.claw_code_application.data.api.models.ToolCall
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 工具调用映射工具
 * 从消息内容中提取工具调用ID，建立消息与工具调用的关联关系
 */

private val mappingJson = Json { ignoreUnknownKeys = true; isLenient = true }

/**
 * 重建消息-工具调用映射关系
 * 遍历所有用户消息，从content中解析tool_use和tool_result的ID，
 * 将它们关联到对应的assistant消息
 */
fun ChatViewModel.rebuildMessageToolCallMapping() {
    messageToToolCalls.clear()
    val assistantIds = _messages.filter { it.role == "assistant" }.map { it.id }.toSet()
    val toolCallIds = _toolCalls.map { it.id }.toSet()

    for (message in _messages) {
        if (message.role != "user") continue
        val content = message.content.trim()
        if (!content.startsWith("[") || !content.endsWith("]")) continue

        try {
            val elements = mappingJson.parseToJsonElement(content).jsonArray
            for (element in elements) {
                val obj = element.jsonObject
                val type = obj["type"]?.jsonPrimitive?.content

                if (type == "tool_use") {
                    val toolUseId = obj["id"]?.jsonPrimitive?.content
                    if (toolUseId != null && toolUseId in toolCallIds) {
                        val closestAssistantId = findClosestAssistantBefore(message.id, assistantIds)
                        if (closestAssistantId != null) {
                            messageToToolCalls.getOrPut(closestAssistantId) { mutableListOf() }.add(toolUseId)
                        }
                    }
                } else if (type == "tool_result") {
                    val toolUseId = obj["tool_use_id"]?.jsonPrimitive?.content
                    if (toolUseId != null && toolUseId in toolCallIds) {
                        val closestAssistantId = findClosestAssistantAfter(message.id, assistantIds)
                        if (closestAssistantId != null) {
                            messageToToolCalls.getOrPut(closestAssistantId) { mutableListOf() }.add(toolUseId)
                        }
                    }
                }
            }
        } catch (_: Exception) { continue }
    }
}

/**
 * 查找指定消息之前最近的assistant消息ID
 */
private fun ChatViewModel.findClosestAssistantBefore(messageId: String, assistantIds: Set<String>): String? {
    val messageIndex = _messages.indexOfFirst { it.id == messageId }
    if (messageIndex == -1) return null
    for (i in messageIndex - 1 downTo 0) {
        if (_messages[i].id in assistantIds) return _messages[i].id
    }
    return null
}

/**
 * 查找指定消息之后最近的assistant消息ID
 */
private fun ChatViewModel.findClosestAssistantAfter(messageId: String, assistantIds: Set<String>): String? {
    val messageIndex = _messages.indexOfFirst { it.id == messageId }
    if (messageIndex == -1) return null
    for (i in messageIndex + 1 until _messages.size) {
        if (_messages[i].id in assistantIds) return _messages[i].id
    }
    return null
}

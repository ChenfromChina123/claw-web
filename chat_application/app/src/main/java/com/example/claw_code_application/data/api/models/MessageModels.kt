package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * 聊天消息
 * 
 * 注意：content 字段可以是 String 或 JsonArray（Anthropic API 格式）
 * 当包含 tool_result 时，content 是数组格式：[{type: "tool_result", ...}]
 */
@Immutable
data class Message(
    val id: String,
    val role: String,
    val content: JsonElement,  // 修改为 JsonElement 以支持 String 或 Array
    @SerializedName("timestamp")
    val timestamp: String,
    @SerializedName("createdAt")
    val createdAt: String? = null,
    @SerializedName("toolCalls")
    val toolCalls: List<ToolCall>? = null,
    val isStreaming: Boolean = false,
    val attachments: List<ImageAttachment>? = null,
    val sequence: Int? = null
) {
    /**
     * 获取文本格式的内容
     * 如果 content 是数组，提取其中的 text 类型块
     * 如果 content 是字符串，直接返回
     * 
     * @return 纯文本内容
     */
    fun getTextContent(): String {
        return when {
            content.isJsonArray -> {
                // 数组格式：提取所有 text 类型的内容
                val array = content.asJsonArray
                val texts = mutableListOf<String>()
                for (element in array) {
                    if (element.isJsonObject) {
                        val obj = element.asJsonObject
                        if (obj.get("type")?.asString == "text") {
                            obj.get("text")?.asString?.let { texts.add(it) }
                        }
                    }
                }
                texts.joinToString("\n")
            }
            content.isJsonPrimitive -> content.asString
            else -> content.toString()
        }
    }

    /**
     * 检查内容是否是 tool_result 类型（应该被过滤）
     * 
     * @return true 如果是 tool_result 类型
     */
    fun isToolResultContent(): Boolean {
        return when {
            content.isJsonArray -> {
                val array = content.asJsonArray
                array.any { element ->
                    if (element.isJsonObject) {
                        val type = element.asJsonObject.get("type")?.asString
                        type == "tool_result" || type == "tool_use"
                    } else false
                }
            }
            content.isJsonObject -> {
                val type = content.asJsonObject.get("type")?.asString
                type == "tool_result" || type == "tool_use"
            }
            content.isJsonPrimitive -> {
                val str = content.asString.trim()
                (str.startsWith("[") || str.startsWith("{")) &&
                (str.contains("\"type\"") && 
                 (str.contains("tool_result") || str.contains("tool_use")))
            }
            else -> false
        }
    }

    /**
     * 获取原始内容的字符串表示（用于日志等）
     */
    fun getContentAsString(): String {
        return when {
            content.isJsonPrimitive -> content.asString
            else -> content.toString()
        }
    }
}

/**
 * 图片附件
 */
@Immutable
data class ImageAttachment(
    val imageId: String,
    val type: String = "image",
    val mimeType: String? = null
)

/**
 * 图片上传结果
 */
@Immutable
data class ImageUploadResult(
    val imageId: String,
    val url: String,
    val originalName: String? = null
)

package com.example.claw_code_application.ui.chat.components

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * 消息内容解析器
 * 将混合文本+工具调用的内容解析为结构化组件列表
 */
object MessageContentParser {

    private val gson = Gson()

    /**
     * 解析消息内容为组件列表
     */
    fun parse(content: String): List<MessageComponent> {
        val components = mutableListOf<MessageComponent>()

        // 尝试解析为 JSON 数组（工具调用格式）
        if (content.trim().startsWith("[") && content.trim().endsWith("]")) {
            try {
                val jsonArray = JsonParser.parseString(content).asJsonArray
                for (element in jsonArray) {
                    val obj = element.asJsonObject
                    val type = obj.get("type")?.asString

                    when (type) {
                        "tool_use" -> {
                            components.add(parseToolUse(obj))
                        }
                        "tool_result" -> {
                            components.add(parseToolResult(obj))
                        }
                        else -> {
                            // 普通文本或其他类型
                            components.add(MessageComponent.Text(obj.toString()))
                        }
                    }
                }
                return components
            } catch (e: Exception) {
                // 解析失败，作为普通文本处理
            }
        }

        // 尝试解析单个 JSON 对象
        if (content.trim().startsWith("{") && content.trim().endsWith("}")) {
            try {
                val jsonObj = JsonParser.parseString(content).asJsonObject
                val type = jsonObj.get("type")?.asString

                when (type) {
                    "tool_use" -> {
                        components.add(parseToolUse(jsonObj))
                        return components
                    }
                    "tool_result" -> {
                        components.add(parseToolResult(jsonObj))
                        return components
                    }
                }
            } catch (e: Exception) {
                // 解析失败，作为普通文本处理
            }
        }

        // 检查内容中是否包含工具调用的 JSON 片段
        val toolUsePattern = """\{\"type\":\"tool_use\"[^}]*\}""".toRegex()
        val toolResultPattern = """\{\"type\":\"tool_result\"[^}]*\}""".toRegex()

        var remainingText = content

        // 提取 tool_use
        toolUsePattern.findAll(content).forEach { match ->
            val beforeText = remainingText.substringBefore(match.value)
            if (beforeText.isNotBlank()) {
                components.add(MessageComponent.Text(beforeText.trim()))
            }
            try {
                val jsonObj = JsonParser.parseString(match.value).asJsonObject
                components.add(parseToolUse(jsonObj))
            } catch (e: Exception) {
                components.add(MessageComponent.Text(match.value))
            }
            remainingText = remainingText.substringAfter(match.value)
        }

        // 提取 tool_result
        toolResultPattern.findAll(remainingText).forEach { match ->
            val beforeText = remainingText.substringBefore(match.value)
            if (beforeText.isNotBlank()) {
                components.add(MessageComponent.Text(beforeText.trim()))
            }
            try {
                val jsonObj = JsonParser.parseString(match.value).asJsonObject
                components.add(parseToolResult(jsonObj))
            } catch (e: Exception) {
                components.add(MessageComponent.Text(match.value))
            }
            remainingText = remainingText.substringAfter(match.value)
        }

        // 添加剩余文本
        if (remainingText.isNotBlank()) {
            components.add(MessageComponent.Text(remainingText.trim()))
        }

        // 如果没有解析出任何组件，将整个内容作为文本
        if (components.isEmpty()) {
            components.add(MessageComponent.Text(content))
        }

        return components
    }

    /**
     * 解析 tool_use JSON
     */
    private fun parseToolUse(jsonObj: JsonObject): MessageComponent {
        val id = jsonObj.get("id")?.asString ?: ""
        val name = jsonObj.get("name")?.asString ?: ""
        val input = jsonObj.get("input")?.asJsonObject ?: JsonObject()

        return MessageComponent.ToolUse(
            id = id,
            toolName = name,
            input = parseToolInput(input)
        )
    }

    /**
     * 解析 tool_result JSON
     */
    private fun parseToolResult(jsonObj: JsonObject): MessageComponent {
        val toolUseId = jsonObj.get("tool_use_id")?.asString ?: ""
        val content = jsonObj.get("content")?.asString ?: ""

        // 尝试解析 content 为结构化数据
        val result = try {
            JsonParser.parseString(content).asJsonObject
        } catch (e: Exception) {
            JsonObject().apply { addProperty("raw", content) }
        }

        val stdout = result.get("stdout")?.asString ?: ""
        val stderr = result.get("stderr")?.asString ?: ""
        val exitCode = result.get("exitCode")?.asInt ?: 0

        return MessageComponent.ToolResult(
            toolUseId = toolUseId,
            stdout = stdout,
            stderr = stderr,
            exitCode = exitCode,
            isSuccess = exitCode == 0
        )
    }

    /**
     * 解析工具输入参数
     */
    private fun parseToolInput(input: JsonObject): Map<String, String> {
        val result = mutableMapOf<String, String>()
        for (entry in input.entrySet()) {
            result[entry.key] = entry.value?.asString ?: entry.value?.toString() ?: ""
        }
        return result
    }

    /**
     * 从 stdout 提取关键信息
     */
    fun extractSummaryFromStdout(stdout: String): String {
        val lines = stdout.lines()

        // 提取标题行（通常包含 ✅ 或 ✅）
        val titleLine = lines.find { it.contains("✅") || it.contains("✓") || it.contains("成功") }
        if (titleLine != null) {
            return titleLine.trim()
        }

        // 提取第一行非空内容
        val firstLine = lines.find { it.isNotBlank() }
        if (firstLine != null) {
            return firstLine.trim().take(50)
        }

        return stdout.trim().take(50)
    }
}

/**
 * 消息组件密封类
 */
sealed class MessageComponent {
    /**
     * 普通文本
     */
    data class Text(val content: String) : MessageComponent()

    /**
     * 工具调用（执行中）
     */
    data class ToolUse(
        val id: String,
        val toolName: String,
        val input: Map<String, String>
    ) : MessageComponent()

    /**
     * 工具结果（已完成）
     */
    data class ToolResult(
        val toolUseId: String,
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
        val isSuccess: Boolean
    ) : MessageComponent()

    /**
     * 步骤进度
     */
    data class StepProgress(
        val currentStep: Int,
        val totalSteps: Int,
        val title: String,
        val steps: List<StepInfo>
    ) : MessageComponent()

    /**
     * 代码差异
     */
    data class CodeDiff(
        val fileName: String,
        val originalCode: String,
        val modifiedCode: String,
        val language: String = ""
    ) : MessageComponent()
}

/**
 * 步骤信息
 */
data class StepInfo(
    val index: Int,
    val title: String,
    val status: StepStatus
)

/**
 * 步骤状态
 */
enum class StepStatus {
    PENDING,      // 待执行
    IN_PROGRESS,  // 执行中
    COMPLETED,    // 已完成
    ERROR         // 失败
}

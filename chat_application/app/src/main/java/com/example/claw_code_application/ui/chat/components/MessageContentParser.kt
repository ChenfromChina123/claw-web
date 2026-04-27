package com.example.claw_code_application.ui.chat.components

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * 消息内容解析器
 * 将混合文本+工具调用的内容解析为结构化组件列表
 * 
 * 支持后端发送的多种格式：
 * 1. JSON数组格式：[{type: 'text', text: '...'}, {type: 'tool_use', ...}]
 * 2. 单个JSON对象
 * 3. 纯文本
 */
object MessageContentParser {

    private val gson = Gson()

    /**
     * 解析消息内容为组件列表
     */
    fun parse(content: String): List<MessageComponent> {
        val components = mutableListOf<MessageComponent>()
        val trimmedContent = content.trim()
        
        android.util.Log.d("MessageParser", "=== parse() 开始 ===")
        android.util.Log.d("MessageParser", "内容长度: ${content.length}")
        android.util.Log.d("MessageParser", "内容前100字符: ${content.take(100)}")

        // 尝试解析为 JSON 数组（后端发送的标准格式）
        if (trimmedContent.startsWith("[") && trimmedContent.endsWith("]")) {
            android.util.Log.d("MessageParser", "检测到JSON数组格式")
            try {
                val jsonArray = JsonParser.parseString(content).asJsonArray
                android.util.Log.d("MessageParser", "数组元素数量: ${jsonArray.size()}")
                for ((index, element) in jsonArray.withIndex()) {
                    if (element.isJsonObject) {
                        val obj = element.asJsonObject
                        val type = obj.get("type")?.asString
                        android.util.Log.d("MessageParser", "[$index] type=$type, keys=${obj.keySet()}")
                        
                        when (type) {
                            "text" -> {
                                val text = obj.get("text")?.asString ?: ""
                                if (text.isNotBlank()) {
                                    components.add(MessageComponent.Text(text))
                                    android.util.Log.d("MessageParser", "  → 添加 Text 组件 (${text.take(30)})")
                                }
                            }
                            "tool_use" -> {
                                components.add(parseToolUse(obj))
                                android.util.Log.d("MessageParser", "  → 添加 ToolUse 组件")
                            }
                            "tool_result" -> {
                                components.add(parseToolResult(obj))
                                android.util.Log.d("MessageParser", "  → 添加 ToolResult/FileListResult 组件")
                            }
                            else -> {
                                // 未知类型，尝试作为文本处理
                                if (obj.toString().isNotBlank()) {
                                    components.add(MessageComponent.Text(obj.toString()))
                                    android.util.Log.d("MessageParser", "  → 添加未知类型文本: $type")
                                }
                            }
                        }
                    }
                }
                if (components.isNotEmpty()) {
                    android.util.Log.d("MessageParser", "解析完成: ${components.size()} 个组件")
                    return components
                }
            } catch (e: Exception) {
                android.util.Log.e("MessageParser", "JSON数组解析失败: ${e.message}", e)
            }
        }

        // 尝试解析单个 JSON 对象
        if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
            try {
                val jsonObj = JsonParser.parseString(content).asJsonObject
                val type = jsonObj.get("type")?.asString

                when (type) {
                    "text" -> {
                        val text = jsonObj.get("text")?.asString ?: ""
                        if (text.isNotBlank()) {
                            components.add(MessageComponent.Text(text))
                        }
                    }
                    "tool_use" -> {
                        components.add(parseToolUse(jsonObj))
                    }
                    "tool_result" -> {
                        components.add(parseToolResult(jsonObj))
                    }
                }
                
                if (components.isNotEmpty()) {
                    return components
                }
            } catch (e: Exception) {
                // 解析失败，作为普通文本处理
            }
        }

        // 如果JSON解析失败，将整个内容作为文本
        components.add(MessageComponent.Text(content))

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
     * 支持多种工具结果格式：
     * - Shell/Bash 工具: {stdout, stderr, exitCode}
     * - FileList 工具: {path, count, files: [{name, path, isDirectory, isFile}]}
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

        // 检测是否是文件列表结果（FileList 工具）
        if (result.has("files") && result.has("count")) {
            return parseFileListResult(toolUseId, result)
        }

        // 标准 Shell 工具结果
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
     * 解析 FileList 工具结果
     */
    private fun parseFileListResult(toolUseId: String, result: JsonObject): MessageComponent {
        val path = result.get("path")?.asString ?: ""
        val count = result.get("count")?.asInt ?: 0
        val files = mutableListOf<FileInfo>()

        val filesArray = result.getAsJsonArray("files")
        filesArray?.forEach { element ->
            if (element.isJsonObject) {
                val fileObj = element.asJsonObject
                files.add(
                    FileInfo(
                        name = fileObj.get("name")?.asString ?: "",
                        path = fileObj.get("path")?.asString ?: "",
                        isDirectory = fileObj.get("isDirectory")?.asBoolean ?: false,
                        isFile = fileObj.get("isFile")?.asBoolean ?: false
                    )
                )
            }
        }

        return MessageComponent.FileListResult(
            toolUseId = toolUseId,
            path = path,
            count = count,
            files = files
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
     * 工具结果（已完成）- Shell/Bash 类型
     */
    data class ToolResult(
        val toolUseId: String,
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
        val isSuccess: Boolean
    ) : MessageComponent()

    /**
     * 文件列表结果（FileList 工具）
     */
    data class FileListResult(
        val toolUseId: String,
        val path: String,
        val count: Int,
        val files: List<FileInfo>
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
 * 文件信息
 */
data class FileInfo(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val isFile: Boolean
)

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

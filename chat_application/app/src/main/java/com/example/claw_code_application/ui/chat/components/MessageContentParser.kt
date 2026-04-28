package com.example.claw_code_application.ui.chat.components

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive
import androidx.compose.runtime.Immutable

/**
 * 消息内容解析器
 * 将混合文本+工具调用的内容解析为结构化组件列表
 *
 * 支持后端发送的多种格式（与Web端保持一致）：
 * 1. JSON数组格式：[{type: 'text', text: '...'}, {type: 'tool_use', ...}]
 * 2. 单个JSON对象：{type: 'text', text: '...'}
 * 3. Anthropic API 数组格式：[{type: 'text', ...}, {type: 'tool_result', ...}]
 * 4. 纯文本
 *
 * 性能优化：内置 LRU 缓存，避免重复解析相同内容
 */
object MessageContentParser {

    private val gson = Gson()

    private val parseCache = mutableMapOf<String, List<MessageComponent>>()

    private const val MAX_CACHE_SIZE = 100

    /**
     * 解析消息内容为组件列表（带缓存）
     */
    fun parse(content: String): List<MessageComponent> {
        if (content.isBlank()) return emptyList()

        // 检查缓存
        parseCache[content]?.let {
            return it
        }

        val components = parseInternal(content)

        // 缓存结果（限制大小防止内存泄漏）
        if (parseCache.size >= MAX_CACHE_SIZE) {
            val keyToRemove = parseCache.keys.first()
            parseCache.remove(keyToRemove)
        }
        parseCache[content] = components

        return components
    }

    /**
     * 内部解析逻辑（无缓存）
     */
    private fun parseInternal(content: String): List<MessageComponent> {
        val trimmedContent = content.trim()

        android.util.Log.d("MessageParser", "=== parse() 开始 ===")
        android.util.Log.d("MessageParser", "内容长度: ${content.length}")
        android.util.Log.d("MessageParser", "内容前100字符: ${content.take(100)}")

        val components = mutableListOf<MessageComponent>()

        // 1. 尝试解析为 JSON 数组（后端发送的标准格式 / Anthropic API 格式）
        if (trimmedContent.startsWith("[") && trimmedContent.endsWith("]")) {
            android.util.Log.d("MessageParser", "检测到JSON数组格式")
            try {
                val jsonArray = JsonParser.parseString(content).asJsonArray
                android.util.Log.d("MessageParser", "数组元素数量: ${jsonArray.size()}")
                for ((index, element) in jsonArray.withIndex()) {
                    if (element.isJsonObject) {
                        val obj = element.asJsonObject
                        val component = parseContentBlock(obj)
                        if (component != null) {
                            components.add(component)
                            android.util.Log.d("MessageParser", "[$index] → ${component.javaClass.simpleName}")
                        }
                    }
                }
                if (components.isNotEmpty()) {
                    android.util.Log.d("MessageParser", "解析完成: ${components.size} 个组件")
                    return components
                }
            } catch (e: Exception) {
                android.util.Log.e("MessageParser", "JSON数组解析失败: ${e.message}", e)
            }
        }

        // 2. 尝试解析单个 JSON 对象
        if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
            try {
                val jsonObj = JsonParser.parseString(content).asJsonObject
                val component = parseContentBlock(jsonObj)
                if (component != null) {
                    components.add(component)
                    return components
                }
            } catch (e: Exception) {
                android.util.Log.e("MessageParser", "JSON对象解析失败: ${e.message}", e)
            }
        }

        // 3. 纯文本
        components.add(MessageComponent.Text(content))
        return components
    }

    /**
     * 解析单个内容块（与Web端 getMessageText 逻辑对齐）
     * 支持 type: text / tool_use / tool_result / thinking
     */
    private fun parseContentBlock(obj: JsonObject): MessageComponent? {
        val type = obj.get("type")?.asString ?: return null

        return when (type) {
            "text" -> {
                val text = obj.get("text")?.asString ?: ""
                if (text.isNotBlank()) {
                    MessageComponent.Text(text)
                } else null
            }

            "tool_use" -> parseToolUse(obj)

            "tool_result" -> parseToolResult(obj)

            "thinking" -> {
                val thinkingText = obj.get("thinking")?.asString ?: ""
                if (thinkingText.isNotBlank()) {
                    MessageComponent.Text(thinkingText)
                } else null
            }

            else -> {
                android.util.Log.d("MessageParser", "未知内容块类型: $type")
                null
            }
        }
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
     * 支持多种工具结果格式（与Web端 toolParser.ts 对齐）：
     * - Shell/Bash 工具: {stdout, stderr, exitCode}
     * - FileList 工具: {path, count, files: [{name, path, isDirectory, isFile}]}
     * - Git 操作: {stdout, output} 包含 modified/deleted/new file
     * - 文件读取: {content, contents}
     * - 搜索结果: {matches, results}
     * - 错误输出: {error, errorType}
     * - 通用对象输出
     */
    private fun parseToolResult(jsonObj: JsonObject): MessageComponent {
        val toolUseId = jsonObj.get("tool_use_id")?.asString ?: ""

        // content 字段可能是字符串或对象
        val contentElement = jsonObj.get("content")
        val result = when {
            contentElement == null || contentElement.isJsonNull -> {
                JsonObject().apply { addProperty("raw", "") }
            }
            contentElement.isJsonObject -> {
                contentElement.asJsonObject
            }
            contentElement.isJsonArray -> {
                JsonObject().apply { add("items", contentElement.asJsonArray) }
            }
            contentElement.isJsonPrimitive -> {
                val contentStr = contentElement.asString
                try {
                    JsonParser.parseString(contentStr).asJsonObject
                } catch (e: Exception) {
                    JsonObject().apply { addProperty("raw", contentStr) }
                }
            }
            else -> {
                JsonObject().apply { addProperty("raw", contentElement.toString()) }
            }
        }

        // 检测是否是文件列表结果（FileList 工具）
        if (result.has("files") && result.has("count")) {
            return parseFileListResult(toolUseId, result)
        }

        // 检测是否是搜索结果（Grep/WebSearch 工具）
        if (result.has("matches") || result.has("results")) {
            return parseSearchResult(toolUseId, result)
        }

        // 检测是否是文件内容读取结果（FileRead 工具）
        if (result.has("content") && !result.has("stdout") && !result.has("exitCode")) {
            return parseFileContentResult(toolUseId, result)
        }
        if (result.has("contents")) {
            return parseFileContentResult(toolUseId, result)
        }

        // 检测是否是错误输出
        if (result.has("error") && !result.has("stdout")) {
            return parseErrorResult(toolUseId, result)
        }

        // 检测是否是成功标志
        if (result.has("success") || result.has("ok")) {
            val isSuccess = result.get("success")?.asBoolean
                ?: result.get("ok")?.asBoolean
                ?: true
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = if (isSuccess) "操作成功完成" else "操作失败",
                stderr = if (!isSuccess) result.get("error")?.asString ?: "" else "",
                exitCode = if (isSuccess) 0 else 1,
                isSuccess = isSuccess
            )
        }

        // 标准 Shell/Bash 工具结果
        val stdout = result.get("stdout")?.asString
            ?: result.get("output")?.asString
            ?: ""
        val stderr = result.get("stderr")?.asString ?: ""
        val exitCode = result.get("exitCode")?.asInt
            ?: result.get("exit_code")?.asInt
            ?: 0

        // 如果有 stdout/output 或 exitCode，按 Shell 结果处理
        if (stdout.isNotEmpty() || stderr.isNotEmpty() || result.has("exitCode") || result.has("exit_code")) {
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = stdout,
                stderr = stderr,
                exitCode = exitCode,
                isSuccess = exitCode == 0
            )
        }

        // 兜底：通用对象输出，尝试提取有用信息
        val rawContent = result.get("raw")?.asString
        if (rawContent != null && rawContent.isNotEmpty()) {
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = rawContent,
                stderr = "",
                exitCode = 0,
                isSuccess = true
            )
        }

        // 最终兜底：将整个对象转为字符串
        return MessageComponent.ToolResult(
            toolUseId = toolUseId,
            stdout = try { gson.toJson(result) } catch (e: Exception) { result.toString() },
            stderr = "",
            exitCode = 0,
            isSuccess = true
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
     * 解析搜索结果（Grep/WebSearch 工具）
     */
    private fun parseSearchResult(toolUseId: String, result: JsonObject): MessageComponent {
        val matchesElement = result.get("matches") ?: result.get("results")
        val matchCount = when (matchesElement) {
            is JsonArray -> matchesElement.size()
            is JsonPrimitive -> {
                try { matchesElement.asInt } catch (e: Exception) { 0 }
            }
            else -> 0
        }

        val matchedFiles = mutableListOf<String>()
        if (matchesElement is JsonArray) {
            for (element in matchesElement.asJsonArray) {
                if (element.isJsonObject) {
                    val matchObj = element.asJsonObject
                    val filePath = matchObj.get("file_path")?.asString
                        ?: matchObj.get("path")?.asString
                        ?: matchObj.get("file")?.asString
                    if (filePath != null) {
                        matchedFiles.add(filePath)
                    }
                }
            }
        }

        val summary = if (matchedFiles.isNotEmpty()) {
            "在 ${matchedFiles.size} 个文件中找到 $matchCount 个匹配结果"
        } else {
            "找到 $matchCount 个匹配结果"
        }

        return MessageComponent.SearchResult(
            toolUseId = toolUseId,
            matchCount = matchCount,
            matchedFiles = matchedFiles,
            summary = summary
        )
    }

    /**
     * 解析文件内容读取结果（FileRead 工具）
     */
    private fun parseFileContentResult(toolUseId: String, result: JsonObject): MessageComponent {
        val content = result.get("content")?.asString
            ?: result.get("contents")?.asString
            ?: ""
        val path = result.get("path")?.asString
            ?: result.get("file_path")?.asString
            ?: ""
        val lineCount = content.lines().size

        return MessageComponent.FileContentResult(
            toolUseId = toolUseId,
            path = path,
            content = content,
            lineCount = lineCount
        )
    }

    /**
     * 解析错误输出
     */
    private fun parseErrorResult(toolUseId: String, result: JsonObject): MessageComponent {
        val error = result.get("error")?.asString ?: "未知错误"
        val errorType = result.get("errorType")?.asString
            ?: result.get("error_type")?.asString
            ?: "UNKNOWN"

        return MessageComponent.ErrorResult(
            toolUseId = toolUseId,
            error = error,
            errorType = errorType
        )
    }

    /**
     * 解析工具输入参数（保留原始类型信息）
     */
    private fun parseToolInput(input: JsonObject): Map<String, Any> {
        val result = mutableMapOf<String, Any>()
        for (entry in input.entrySet()) {
            result[entry.key] = jsonElementToValue(entry.value)
        }
        return result
    }

    /**
     * 将 JsonElement 转换为 Kotlin 原始类型（保留类型信息）
     */
    private fun jsonElementToValue(element: JsonElement): Any {
        return when {
            element.isJsonNull -> ""
            element.isJsonPrimitive -> {
                val prim = element.asJsonPrimitive
                when {
                    prim.isBoolean -> prim.asBoolean
                    prim.isNumber -> {
                        val num = prim.asNumber
                        if (num.toDouble() == num.toLong().toDouble()) num.toLong() else num.toDouble()
                    }
                    else -> prim.asString
                }
            }
            element.isJsonArray -> {
                try {
                    gson.fromJson(element, List::class.java) ?: emptyList<Any>()
                } catch (e: Exception) {
                    element.toString()
                }
            }
            element.isJsonObject -> {
                try {
                    gson.fromJson(element, Map::class.java) ?: emptyMap<String, Any>()
                } catch (e: Exception) {
                    element.toString()
                }
            }
            else -> element.toString()
        }
    }

    /**
     * 从 stdout 提取关键信息
     */
    fun extractSummaryFromStdout(stdout: String): String {
        val lines = stdout.lines()

        val titleLine = lines.find { it.contains("✅") || it.contains("✓") || it.contains("成功") }
        if (titleLine != null) {
            return titleLine.trim()
        }

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
@Immutable
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
        val input: Map<String, Any>
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
     * 搜索结果（Grep/WebSearch 工具）
     */
    data class SearchResult(
        val toolUseId: String,
        val matchCount: Int,
        val matchedFiles: List<String>,
        val summary: String
    ) : MessageComponent()

    /**
     * 文件内容读取结果（FileRead 工具）
     */
    data class FileContentResult(
        val toolUseId: String,
        val path: String,
        val content: String,
        val lineCount: Int
    ) : MessageComponent()

    /**
     * 错误结果
     */
    data class ErrorResult(
        val toolUseId: String,
        val error: String,
        val errorType: String
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

    /**
     * 图片组件
     */
    data class Image(
        val imageUrl: String,
        val originalName: String? = null
    ) : MessageComponent()
}

/**
 * 文件信息
 */
@Immutable
data class FileInfo(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val isFile: Boolean
)

/**
 * 步骤信息
 */
@Immutable
data class StepInfo(
    val index: Int,
    val title: String,
    val status: StepStatus
)

/**
 * 步骤状态
 */
enum class StepStatus {
    PENDING,
    IN_PROGRESS,
    COMPLETED,
    ERROR
}

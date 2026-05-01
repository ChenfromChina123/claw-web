package com.example.claw_code_application.ui.chat.components

import androidx.compose.runtime.Immutable
import kotlinx.serialization.json.*
import kotlinx.serialization.encodeToString

object MessageContentParser {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private const val MAX_CACHE_SIZE = 100

    /**
     * LRU缓存：使用LinkedHashMap的accessOrder模式
     * 最近访问的条目移到链表尾部，淘汰时移除链表头部（最久未访问）
     */
    private val parseCache = object : LinkedHashMap<String, List<MessageComponent>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<MessageComponent>>): Boolean {
            return size > MAX_CACHE_SIZE
        }
    }

    fun parse(content: String): List<MessageComponent> {
        if (content.isBlank()) return emptyList()

        parseCache[content]?.let {
            return it
        }

        val components = parseInternal(content)
        parseCache[content] = components

        return components
    }

    private fun parseInternal(content: String): List<MessageComponent> {
        val trimmedContent = content.trim()

        android.util.Log.d("MessageParser", "=== parse() 开始 ===")
        android.util.Log.d("MessageParser", "内容长度: ${content.length}")
        android.util.Log.d("MessageParser", "内容前100字符: ${content.take(100)}")

        val components = mutableListOf<MessageComponent>()

        if (trimmedContent.startsWith("[") && trimmedContent.endsWith("]")) {
            android.util.Log.d("MessageParser", "检测到JSON数组格式")
            try {
                val jsonArray = json.parseToJsonElement(content).jsonArray
                android.util.Log.d("MessageParser", "数组元素数量: ${jsonArray.size}")
                for ((index, element) in jsonArray.withIndex()) {
                    if (element is JsonObject) {
                        val component = parseContentBlock(element)
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

        if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
            try {
                val jsonObj = json.parseToJsonElement(content).jsonObject
                val component = parseContentBlock(jsonObj)
                if (component != null) {
                    components.add(component)
                    return components
                }
            } catch (e: Exception) {
                android.util.Log.e("MessageParser", "JSON对象解析失败: ${e.message}", e)
            }
        }

        components.add(MessageComponent.Text(content))
        return components
    }

    private fun parseContentBlock(obj: JsonObject): MessageComponent? {
        val type = obj["type"]?.jsonPrimitive?.content ?: return null

        return when (type) {
            "text" -> {
                val text = obj["text"]?.jsonPrimitive?.content ?: ""
                if (text.isNotBlank()) {
                    MessageComponent.Text(text)
                } else null
            }

            "tool_use" -> parseToolUse(obj)

            "tool_result" -> parseToolResult(obj)

            "thinking" -> {
                val thinkingText = obj["thinking"]?.jsonPrimitive?.content ?: ""
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

    private fun parseToolUse(jsonObj: JsonObject): MessageComponent {
        val id = jsonObj["id"]?.jsonPrimitive?.content ?: ""
        val name = jsonObj["name"]?.jsonPrimitive?.content ?: ""
        val input = jsonObj["input"]?.jsonObject ?: JsonObject(emptyMap())

        return MessageComponent.ToolUse(
            id = id,
            toolName = name,
            input = parseToolInput(input)
        )
    }

    private fun parseToolResult(jsonObj: JsonObject): MessageComponent {
        val toolUseId = jsonObj["tool_use_id"]?.jsonPrimitive?.content ?: ""

        val contentElement = jsonObj["content"]
        val result = when {
            contentElement == null || contentElement is JsonNull -> {
                buildJsonObject { put("raw", "") }
            }
            contentElement is JsonObject -> contentElement
            contentElement is JsonArray -> {
                buildJsonObject { put("items", contentElement) }
            }
            contentElement is JsonPrimitive -> {
                val contentStr = contentElement.content
                try {
                    json.parseToJsonElement(contentStr).jsonObject
                } catch (e: Exception) {
                    buildJsonObject { put("raw", contentStr) }
                }
            }
            else -> {
                buildJsonObject { put("raw", contentElement.toString()) }
            }
        }

        if (result.containsKey("files") && result.containsKey("count")) {
            return parseFileListResult(toolUseId, result)
        }

        if (result.containsKey("matches") || result.containsKey("results")) {
            return parseSearchResult(toolUseId, result)
        }

        if (result.containsKey("content") && !result.containsKey("stdout") && !result.containsKey("exitCode")) {
            return parseFileContentResult(toolUseId, result)
        }
        if (result.containsKey("contents")) {
            return parseFileContentResult(toolUseId, result)
        }

        if (result.containsKey("error") && !result.containsKey("stdout")) {
            return parseErrorResult(toolUseId, result)
        }

        if (result.containsKey("success") || result.containsKey("ok")) {
            val isSuccess = result["success"]?.jsonPrimitive?.boolean
                ?: result["ok"]?.jsonPrimitive?.boolean
                ?: true
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = if (isSuccess) "操作成功完成" else "操作失败",
                stderr = if (!isSuccess) result["error"]?.jsonPrimitive?.content ?: "" else "",
                exitCode = if (isSuccess) 0 else 1,
                isSuccess = isSuccess
            )
        }

        val stdout = result["stdout"]?.jsonPrimitive?.content
            ?: result["output"]?.jsonPrimitive?.content
            ?: ""
        val stderr = result["stderr"]?.jsonPrimitive?.content ?: ""
        val exitCode = result["exitCode"]?.jsonPrimitive?.int
            ?: result["exit_code"]?.jsonPrimitive?.int
            ?: 0

        if (stdout.isNotEmpty() || stderr.isNotEmpty() || result.containsKey("exitCode") || result.containsKey("exit_code")) {
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = stdout,
                stderr = stderr,
                exitCode = exitCode,
                isSuccess = exitCode == 0
            )
        }

        val rawContent = result["raw"]?.jsonPrimitive?.content
        if (rawContent != null && rawContent.isNotEmpty()) {
            return MessageComponent.ToolResult(
                toolUseId = toolUseId,
                stdout = rawContent,
                stderr = "",
                exitCode = 0,
                isSuccess = true
            )
        }

        return MessageComponent.ToolResult(
            toolUseId = toolUseId,
            stdout = try { json.encodeToString(result) } catch (e: Exception) { result.toString() },
            stderr = "",
            exitCode = 0,
            isSuccess = true
        )
    }

    private fun parseFileListResult(toolUseId: String, result: JsonObject): MessageComponent {
        val path = result["path"]?.jsonPrimitive?.content ?: ""
        val count = result["count"]?.jsonPrimitive?.int ?: 0
        val files = mutableListOf<FileInfo>()

        val filesArray = result["files"]?.jsonArray
        filesArray?.forEach { element ->
            if (element is JsonObject) {
                files.add(
                    FileInfo(
                        name = element["name"]?.jsonPrimitive?.content ?: "",
                        path = element["path"]?.jsonPrimitive?.content ?: "",
                        isDirectory = element["isDirectory"]?.jsonPrimitive?.boolean ?: false,
                        isFile = element["isFile"]?.jsonPrimitive?.boolean ?: false
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

    private fun parseSearchResult(toolUseId: String, result: JsonObject): MessageComponent {
        val matchesElement = result["matches"] ?: result["results"]
        val matchCount = when (matchesElement) {
            is JsonArray -> matchesElement.size
            is JsonPrimitive -> {
                try { matchesElement.content.toInt() } catch (e: Exception) { 0 }
            }
            else -> 0
        }

        val matchedFiles = mutableListOf<String>()
        if (matchesElement is JsonArray) {
            for (element in matchesElement) {
                if (element is JsonObject) {
                    val filePath = element["file_path"]?.jsonPrimitive?.content
                        ?: element["path"]?.jsonPrimitive?.content
                        ?: element["file"]?.jsonPrimitive?.content
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

    private fun parseFileContentResult(toolUseId: String, result: JsonObject): MessageComponent {
        val content = result["content"]?.jsonPrimitive?.content
            ?: result["contents"]?.jsonPrimitive?.content
            ?: ""
        val path = result["path"]?.jsonPrimitive?.content
            ?: result["file_path"]?.jsonPrimitive?.content
            ?: ""
        val lineCount = content.lines().size

        return MessageComponent.FileContentResult(
            toolUseId = toolUseId,
            path = path,
            content = content,
            lineCount = lineCount
        )
    }

    private fun parseErrorResult(toolUseId: String, result: JsonObject): MessageComponent {
        val error = result["error"]?.jsonPrimitive?.content ?: "未知错误"
        val errorType = result["errorType"]?.jsonPrimitive?.content
            ?: result["error_type"]?.jsonPrimitive?.content
            ?: "UNKNOWN"

        return MessageComponent.ErrorResult(
            toolUseId = toolUseId,
            error = error,
            errorType = errorType
        )
    }

    private fun parseToolInput(input: JsonObject): Map<String, Any> {
        val result = mutableMapOf<String, Any>()
        for ((key, value) in input) {
            result[key] = jsonElementToValue(value)
        }
        return result
    }

    private fun jsonElementToValue(element: JsonElement): Any {
        return when {
            element is JsonNull -> ""
            element is JsonPrimitive -> {
                val prim = element
                if (prim.isString) {
                    prim.content
                } else if (prim.content.toBooleanStrictOrNull() != null) {
                    prim.content.toBooleanStrict()
                } else {
                    prim.content.toDoubleOrNull() ?: prim.content
                }
            }
            element is JsonArray -> {
                try {
                    element.map { jsonElementToValue(it) }
                } catch (e: Exception) {
                    element.toString()
                }
            }
            element is JsonObject -> {
                try {
                    element.keys.associateWith { jsonElementToValue(element[it]!!) }
                } catch (e: Exception) {
                    element.toString()
                }
            }
            else -> element.toString()
        }
    }

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

@Immutable
sealed class MessageComponent {
    data class Text(val content: String) : MessageComponent()

    data class ToolUse(
        val id: String,
        val toolName: String,
        val input: Map<String, Any>
    ) : MessageComponent()

    data class ToolResult(
        val toolUseId: String,
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
        val isSuccess: Boolean
    ) : MessageComponent()

    data class FileListResult(
        val toolUseId: String,
        val path: String,
        val count: Int,
        val files: List<FileInfo>
    ) : MessageComponent()

    data class SearchResult(
        val toolUseId: String,
        val matchCount: Int,
        val matchedFiles: List<String>,
        val summary: String
    ) : MessageComponent()

    data class FileContentResult(
        val toolUseId: String,
        val path: String,
        val content: String,
        val lineCount: Int
    ) : MessageComponent()

    data class ErrorResult(
        val toolUseId: String,
        val error: String,
        val errorType: String
    ) : MessageComponent()

    data class StepProgress(
        val currentStep: Int,
        val totalSteps: Int,
        val title: String,
        val steps: List<StepInfo>
    ) : MessageComponent()

    data class CodeDiff(
        val fileName: String,
        val originalCode: String,
        val modifiedCode: String,
        val language: String = ""
    ) : MessageComponent()

    data class Image(
        val imageUrl: String,
        val originalName: String? = null
    ) : MessageComponent()
}

@Immutable
data class FileInfo(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val isFile: Boolean
)

@Immutable
data class StepInfo(
    val index: Int,
    val title: String,
    val status: StepStatus
)

enum class StepStatus {
    PENDING,
    IN_PROGRESS,
    COMPLETED,
    ERROR
}
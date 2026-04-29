package com.example.claw_code_application.ui.chat.components

import com.example.claw_code_application.data.api.models.ToolCall

/**
 * 工具深度解析器（对标Web端 toolParser.ts）
 * 按工具类型分类解析输入参数和输出结果
 * 提取工具描述、参数信息、输出摘要和指标
 */
object ToolParser {

    /**
     * 工具描述模板（与Web端 TOOL_DESCRIPTIONS 对齐）
     */
    private val TOOL_DESCRIPTIONS = mapOf(
        "Read" to "读取文件内容",
        "ReadFile" to "读取文件内容",
        "read" to "读取文件内容",
        "read_file" to "读取文件内容",
        "FileRead" to "读取文件内容",
        "Write" to "写入文件内容",
        "WriteFile" to "写入文件内容",
        "write" to "写入文件内容",
        "write_file" to "写入文件内容",
        "FileWrite" to "写入文件",
        "filewrite" to "写入文件",
        "Edit" to "编辑文件",
        "edit" to "编辑文件",
        "EditFile" to "编辑文件",
        "edit_file" to "编辑文件",
        "FileEdit" to "编辑文件",
        "Delete" to "删除文件",
        "delete" to "删除文件",
        "DeleteFile" to "删除文件",
        "FileDelete" to "删除文件",
        "FileList" to "列出文件",
        "Glob" to "查找匹配的文件",
        "glob" to "查找文件",
        "Grep" to "在文件中搜索文本",
        "grep" to "搜索文本",
        "Bash" to "执行 Shell 命令",
        "bash" to "执行命令",
        "Shell" to "执行 Shell 命令",
        "shell" to "执行命令",
        "PowerShell" to "执行 PowerShell 命令",
        "WebSearch" to "网络搜索",
        "web_search" to "网络搜索",
        "WebFetch" to "获取网页内容",
        "web_fetch" to "获取网页",
        "Git" to "执行 Git 操作",
        "git" to "Git 操作",
        "MCP" to "调用 MCP 服务",
        "Agent" to "调用 AI Agent",
        "Todo" to "管理待办事项",
        "TodoWrite" to "管理待办事项",
        "WebRead" to "读取网页内容",
        "webread" to "读取网页",
        "FileRename" to "重命名文件",
        "AskUserQuestion" to "询问用户问题",
        "SendMessage" to "发送消息",
        "Sleep" to "等待",
        "TaskCreate" to "创建任务",
        "TaskList" to "列出任务",
        "Config" to "配置管理",
        "ExitPlanMode" to "退出计划模式",
        "NotebookEdit" to "编辑笔记本",
    )

    /**
     * 路径相关字段
     */
    private val PATH_FIELDS = listOf(
        "path", "file_path", "targetPath", "target_path", "filePath",
        "destPath", "destination", "sourcePath", "source_path",
        "dirPath", "dir_path", "directory", "dir", "file", "filename", "name"
    )

    /**
     * 内容相关字段
     */
    private val CONTENT_FIELDS = listOf(
        "content", "text", "data", "body", "code", "html", "css", "script"
    )

    /**
     * 命令相关字段
     */
    private val COMMAND_FIELDS = listOf(
        "command", "cmd", "shell", "bash", "script", "executable"
    )

    /**
     * 搜索相关字段
     */
    private val SEARCH_FIELDS = listOf(
        "query", "search_term", "search", "keyword", "pattern", "regex", "text", "find"
    )

    /**
     * 解析后的工具信息
     */
    data class ParsedToolInfo(
        val toolName: String,
        val category: String,
        val description: String,
        val parameters: List<ParameterInfo>,
        val expectedOutput: String
    )

    /**
     * 参数信息
     */
    data class ParameterInfo(
        val name: String,
        val type: String,
        val description: String,
        val required: Boolean,
        val value: Any?,
        val isPath: Boolean = false
    )

    /**
     * 解析后的工具结果
     */
    data class ParsedToolResult(
        val type: String,
        val summary: String,
        val details: List<String>,
        val metrics: OutputMetrics?
    )

    /**
     * 输出指标
     */
    data class OutputMetrics(
        val lines: Int? = null,
        val files: Int? = null,
        val errors: Int? = null,
        val duration: Long? = null
    )

    /**
     * 获取工具描述
     */
    fun getToolDescription(toolName: String): String {
        return TOOL_DESCRIPTIONS[toolName] ?: "${toolName} 操作"
    }

    /**
     * 获取工具类别
     */
    fun getToolCategory(toolName: String): String {
        val lower = toolName.lowercase()
        return when {
            lower.contains("read") || lower.contains("file") && !lower.contains("write") -> "file"
            lower.contains("write") || lower.contains("edit") || lower.contains("delete") -> "file"
            lower.contains("glob") || lower.contains("list") -> "file"
            lower.contains("bash") || lower.contains("shell") -> "shell"
            lower.contains("grep") || lower.contains("search") -> "search"
            lower.contains("web") -> "web"
            lower.contains("git") -> "git"
            lower.contains("agent") -> "agent"
            lower.contains("todo") || lower.contains("task") -> "task"
            else -> "other"
        }
    }

    /**
     * 解析工具调用（对标Web端 parseToolCall）
     */
    fun parseToolCall(toolCall: ToolCall): ParsedToolInfo {
        val toolName = toolCall.toolName.ifBlank { "unknown" }
        val category = getToolCategory(toolName)

        return ParsedToolInfo(
            toolName = toolName,
            category = category,
            description = getToolDescription(toolName),
            parameters = parseToolParameters(toolName, toolCall.toolInput),
            expectedOutput = getExpectedOutput(toolName)
        )
    }

    /**
     * 解析工具输入参数（对标Web端 parseToolParameters）
     */
    fun parseToolParameters(toolName: String, input: Map<String, Any>): List<ParameterInfo> {
        val params = mutableListOf<ParameterInfo>()
        val lowerToolName = toolName.lowercase()

        // 文件读取工具
        if (lowerToolName.contains("read") || (lowerToolName.contains("file") && !lowerToolName.contains("write"))) {
            for (field in PATH_FIELDS) {
                val pathValue = extractStringValue(input, field)
                if (pathValue != null) {
                    params.add(ParameterInfo("path", "string", "文件路径", true, pathValue, isPath = true))
                    break
                }
            }
            addOptionalNumberParam(input, "limit", "最大读取行数", params)
            addOptionalNumberParam(input, "start", "起始行号", params)
            if (params.isNotEmpty()) return params
        }

        // 文件写入工具
        if (lowerToolName.contains("write") || lowerToolName == "filewrite") {
            for (field in PATH_FIELDS) {
                val pathValue = extractStringValue(input, field)
                if (pathValue != null) {
                    params.add(ParameterInfo("path", "string", "文件路径", true, pathValue, isPath = true))
                    break
                }
            }
            for (field in CONTENT_FIELDS) {
                if (input[field] != null) {
                    val contentValue = truncateString(input[field].toString(), 150)
                    params.add(ParameterInfo("content", "string", "文件内容", true, contentValue))
                    break
                }
            }
            addOptionalBoolParam(input, "append", "追加模式", params)
            if (params.isNotEmpty()) return params
        }

        // 文件编辑工具
        if (lowerToolName.contains("edit") || lowerToolName == "str_replace") {
            for (field in PATH_FIELDS) {
                val pathValue = extractStringValue(input, field)
                if (pathValue != null) {
                    params.add(ParameterInfo("path", "string", "文件路径", true, pathValue, isPath = true))
                    break
                }
            }
            if (input["new_content"] != null) {
                params.add(ParameterInfo("new_content", "string", "新内容", true,
                    truncateString(input["new_content"].toString(), 150)))
            }
            if (input["old_string"] != null) {
                params.add(ParameterInfo("old_string", "string", "要替换的内容", true,
                    truncateString(input["old_string"].toString(), 100)))
            }
            if (params.isNotEmpty()) return params
        }

        // 搜索工具
        if (lowerToolName.contains("grep") || lowerToolName.contains("search")) {
            for (field in SEARCH_FIELDS) {
                if (input[field] != null) {
                    params.add(ParameterInfo(field, "string", "搜索关键词", true, input[field]))
                    break
                }
            }
            for (field in PATH_FIELDS) {
                val pathValue = extractStringValue(input, field)
                if (pathValue != null) {
                    params.add(ParameterInfo("path", "string", "搜索目录", false, pathValue, isPath = true))
                    break
                }
            }
            if (params.isNotEmpty()) return params
        }

        // Shell 命令
        if (lowerToolName.contains("bash") || lowerToolName.contains("shell") || lowerToolName.contains("powershell")) {
            for (field in COMMAND_FIELDS) {
                if (input[field] != null) {
                    val cmdValue = truncateString(input[field].toString(), 200)
                    params.add(ParameterInfo("command", "string", "执行的命令", true, cmdValue))
                    break
                }
            }
            if (input["working_directory"] != null || input["cwd"] != null) {
                params.add(ParameterInfo("cwd", "string", "工作目录", false,
                    input["working_directory"] ?: input["cwd"], isPath = true))
            }
            addOptionalNumberParam(input, "timeout", "超时时间(ms)", params)
            if (params.isNotEmpty()) return params
        }

        // 通用参数解析
        addStringParamIfExists(input, "command", "要执行的命令", true, params)
        addPathParamIfExists(input, "path", "文件路径", params)
        addPathParamIfExists(input, "file_path", "文件路径", params)
        addPathParamIfExists(input, "filename", "文件名", params)
        addStringParamIfExists(input, "content", "内容", false, params, 200)
        addStringParamIfExists(input, "text", "文本内容", false, params, 200)
        addStringParamIfExists(input, "query", "查询内容", true, params)
        addStringParamIfExists(input, "search_term", "搜索关键词", true, params)
        addStringParamIfExists(input, "pattern", "匹配模式", false, params)
        addStringParamIfExists(input, "glob", "文件匹配模式", false, params)
        addOptionalBoolParam(input, "recursive", "是否递归", params)
        addPathParamIfExists(input, "directory", "目录路径", params)
        addOptionalNumberParam(input, "timeout", "超时时间(毫秒)", params)
        addPathParamIfExists(input, "working_directory", "工作目录", params)

        return params
    }

    /**
     * 解析工具输出结果（对标Web端 parseToolOutput）
     */
    fun parseToolResult(toolCall: ToolCall): ParsedToolResult {
        val output = toolCall.toolOutput ?: return ParsedToolResult(
            type = "info",
            summary = "执行完成，无输出",
            details = emptyList(),
            metrics = null
        )

        var summary = ""
        val details = mutableListOf<String>()
        var metrics: OutputMetrics? = null

        when (output) {
            is kotlinx.serialization.json.JsonPrimitive -> {
                val content = output.content
                summary = truncateString(content, 150)
                val fileMatches = Regex("[\\w\\-.\\\\/]+\\.(ts|tsx|js|jsx|json|md|txt|py|html|css)", RegexOption.IGNORE_CASE)
                    .findAll(content).toList()
                if (fileMatches.isNotEmpty()) {
                    metrics = OutputMetrics(files = fileMatches.size)
                    details.add("涉及 ${fileMatches.size} 个文件")
                }
                val lineMatch = Regex("(\\d+) lines?").find(content)
                if (lineMatch != null) {
                    metrics = metrics?.copy(lines = lineMatch.groupValues[1].toIntOrNull())
                        ?: OutputMetrics(lines = lineMatch.groupValues[1].toIntOrNull())
                }
            }
            is kotlinx.serialization.json.JsonObject -> {
                val outputMap = output.toMap()

                // Git/Shell 输出
                val stdout = outputMap["stdout"]?.toString() ?: outputMap["output"]?.toString() ?: ""
                if (stdout.isNotEmpty()) {
                    summary = truncateString(stdout, 150)
                    if (stdout.contains("modified") || stdout.contains("deleted") || stdout.contains("new file")) {
                        val files = stdout.lines().filter { it.isNotBlank() }
                        metrics = OutputMetrics(files = files.size)
                        details.add("Git 修改了 ${files.size} 个文件")
                    }
                }

                // 文件内容
                val content = outputMap["content"]?.toString() ?: outputMap["contents"]?.toString()
                if (content != null && summary.isEmpty()) {
                    val lineCount = content.lines().size
                    summary = "读取了 $lineCount 行内容"
                    metrics = OutputMetrics(lines = lineCount)
                }

                // 搜索结果
                val matches = outputMap["matches"] ?: outputMap["results"]
                if (matches != null && summary.isEmpty()) {
                    val matchCount = when (matches) {
                        is List<*> -> matches.size
                        else -> 0
                    }
                    summary = "找到 $matchCount 个匹配结果"
                    details.add("共 $matchCount 处匹配")
                }

                // Shell 退出码
                val exitCode = outputMap["exitCode"]?.toString()?.toIntOrNull()
                    ?: outputMap["exit_code"]?.toString()?.toIntOrNull()
                if (exitCode != null && summary.isEmpty()) {
                    summary = if (exitCode == 0) "命令执行成功" else "命令执行失败，退出码: $exitCode"
                }

                // 错误
                val error = outputMap["error"]?.toString()
                if (error != null && summary.isEmpty()) {
                    summary = "错误: $error"
                }

                // 成功标志
                if (summary.isEmpty() && (outputMap["success"] != null || outputMap["ok"] != null)) {
                    summary = "操作成功完成"
                }

                if (summary.isEmpty()) {
                    summary = truncateString(outputMap.toString(), 100)
                }
            }
            is kotlinx.serialization.json.JsonArray -> {
                val list = output.toList()
                summary = truncateString(list.toString(), 150)
                if (list.isNotEmpty()) {
                    metrics = OutputMetrics(files = list.size)
                    details.add("共 ${list.size} 项结果")
                }
            }
            else -> {
                summary = truncateString(output.toString(), 150)
            }
        }

        val type = when {
            toolCall.status == "completed" && metrics?.errors != null && metrics.errors > 0 -> "partial"
            toolCall.status == "completed" -> "success"
            toolCall.status == "error" -> "failure"
            else -> "info"
        }

        return ParsedToolResult(
            type = type,
            summary = summary,
            details = details,
            metrics = metrics
        )
    }

    /**
     * 获取预期输出描述
     */
    private fun getExpectedOutput(toolName: String): String {
        val outputs = mapOf(
            "Read" to "文件内容",
            "Write" to "写入结果",
            "Edit" to "编辑结果",
            "Glob" to "匹配的文件列表",
            "Grep" to "搜索匹配结果",
            "Bash" to "命令输出",
            "WebSearch" to "搜索结果列表",
            "WebFetch" to "网页内容",
            "Git" to "Git 操作输出"
        )
        return outputs[toolName] ?: "操作结果"
    }

    private fun extractStringValue(input: Map<String, Any>, field: String): String? {
        val value = input[field] ?: return null
        if (value is String && value.isNotEmpty()) {
            return value.replace(Regex("^['\"]|['\"]$"), "").trim()
        }
        return null
    }

    private fun truncateString(str: String, maxLength: Int): String {
        return if (str.length <= maxLength) str else str.substring(0, maxLength) + "..."
    }

    private fun addStringParamIfExists(
        input: Map<String, Any>, field: String, desc: String,
        required: Boolean, params: MutableList<ParameterInfo>, maxLen: Int = Int.MAX_VALUE
    ) {
        if (input[field] != null) {
            val value = input[field].toString()
            params.add(ParameterInfo(field, "string", desc, required,
                if (value.length > maxLen) truncateString(value, maxLen) else value))
        }
    }

    private fun addPathParamIfExists(
        input: Map<String, Any>, field: String, desc: String,
        params: MutableList<ParameterInfo>
    ) {
        val value = extractStringValue(input, field)
        if (value != null) {
            params.add(ParameterInfo(field, "string", desc, true, value, isPath = true))
        }
    }

    private fun addOptionalNumberParam(
        input: Map<String, Any>, field: String, desc: String,
        params: MutableList<ParameterInfo>
    ) {
        if (input[field] != null) {
            params.add(ParameterInfo(field, "number", desc, false, input[field]))
        }
    }

    private fun addOptionalBoolParam(
        input: Map<String, Any>, field: String, desc: String,
        params: MutableList<ParameterInfo>
    ) {
        if (input[field] != null) {
            params.add(ParameterInfo(field, "boolean", desc, false, input[field]))
        }
    }
}

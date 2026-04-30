package com.example.claw_code_application.util

/**
 * 内容大小限制工具类
 * 与 Server 端保持一致，防止过大的内容导致性能问题
 *
 * 限制规则：
 * - 消息内容最大 4MB
 * - 工具输出最大 400KB
 * - 超过限制时自动截断并添加提示
 */
object ContentLimiter {

    /**
     * 消息内容最大长度 (4MB)
     * 与 server/src/master/db/repositories/messageRepository.ts 保持一致
     */
    private const val MAX_MESSAGE_CONTENT_LENGTH = 4 * 1024 * 1024 // 4MB

    /**
     * 工具输出最大长度 (400KB)
     * 与 server/src/master/utils/fileLimits.ts 保持一致
     */
    private const val MAX_TOOL_OUTPUT_LENGTH = 400 * 1024 // 400KB

    /**
     * 截断提示信息
     */
    private const val TRUNCATION_NOTICE = "\n\n[内容已截断] 原始内容过大，仅显示前 %s。建议使用文件工具分块读取大文件。"

    /**
     * 截断消息内容
     *
     * @param content 原始内容
     * @return 截断后的内容
     */
    fun truncateMessageContent(content: String?): String? {
        if (content == null) return null
        if (content.length <= MAX_MESSAGE_CONTENT_LENGTH) return content

        // 截断并添加提示
        val truncated = content.substring(0, MAX_MESSAGE_CONTENT_LENGTH - TRUNCATION_NOTICE.length - 10)
        return truncated + TRUNCATION_NOTICE.format("4MB")
    }

    /**
     * 截断工具输出内容
     *
     * @param output 原始输出
     * @return 截断后的输出
     */
    fun truncateToolOutput(output: String?): String? {
        if (output == null) return null
        if (output.length <= MAX_TOOL_OUTPUT_LENGTH) return output

        // 截断并添加提示
        val truncated = output.substring(0, MAX_TOOL_OUTPUT_LENGTH - TRUNCATION_NOTICE.length - 10)
        return truncated + TRUNCATION_NOTICE.format("400KB")
    }

    /**
     * 检查内容是否需要截断
     *
     * @param content 内容
     * @param maxLength 最大长度
     * @return 是否需要截断
     */
    fun needsTruncation(content: String?, maxLength: Int): Boolean {
        return content != null && content.length > maxLength
    }

    /**
     * 格式化字节大小为可读字符串
     *
     * @param bytes 字节数
     * @return 格式化后的字符串 (如 "4MB", "400KB")
     */
    fun formatBytes(bytes: Long): String {
        return when {
            bytes >= 1024 * 1024 * 1024 -> "%.2f GB".format(bytes / (1024.0 * 1024.0 * 1024.0))
            bytes >= 1024 * 1024 -> "%.2f MB".format(bytes / (1024.0 * 1024.0))
            bytes >= 1024 -> "%.2f KB".format(bytes / 1024.0)
            else -> "$bytes B"
        }
    }
}

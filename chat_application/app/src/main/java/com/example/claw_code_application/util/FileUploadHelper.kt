package com.example.claw_code_application.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/**
 * 文件上传辅助类
 * 处理从 URI 读取文件内容并准备上传
 */
object FileUploadHelper {

    private const val TAG = "FileUploadHelper"

    /**
     * 从 URI 读取文件信息
     *
     * @param context 上下文
     * @param uri 文件 URI
     * @return 文件信息（文件名和内容）
     */
    suspend fun readFileFromUri(context: Context, uri: Uri): Result<FileInfo> = withContext(Dispatchers.IO) {
        try {
            val contentResolver = context.contentResolver

            // 获取文件名
            var fileName = "unknown"
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        fileName = cursor.getString(nameIndex) ?: "unknown"
                    }
                }
            }

            // 读取文件内容
            val inputStream = contentResolver.openInputStream(uri)
                ?: return@withContext Result.failure(Exception("无法打开文件"))

            val byteArrayOutputStream = ByteArrayOutputStream()
            inputStream.use { input ->
                input.copyTo(byteArrayOutputStream)
            }
            val content = byteArrayOutputStream.toByteArray()

            Logger.i(TAG, "读取文件成功: $fileName, 大小: ${content.size} bytes")
            Result.success(FileInfo(fileName, content))
        } catch (e: Exception) {
            Logger.e(TAG, "读取文件失败", e)
            Result.failure(e)
        }
    }

    /**
     * 从多个 URI 读取文件
     *
     * @param context 上下文
     * @param uris 文件 URI 列表
     * @return 文件信息列表
     */
    suspend fun readFilesFromUris(context: Context, uris: List<Uri>): List<FileInfo> = withContext(Dispatchers.IO) {
        val results = mutableListOf<FileInfo>()
        for (uri in uris) {
            readFileFromUri(context, uri).onSuccess { fileInfo ->
                results.add(fileInfo)
            }.onFailure { error ->
                Logger.e(TAG, "读取文件失败: $uri, 错误: ${error.message}")
            }
        }
        results
    }

    /**
     * 格式化文件大小
     *
     * @param bytes 字节数
     * @return 格式化后的字符串
     */
    fun formatFileSize(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            bytes < 1024 * 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
            else -> "${bytes / (1024 * 1024 * 1024)} GB"
        }
    }

    /**
     * 检查文件类型是否允许上传
     *
     * @param fileName 文件名
     * @return 是否允许
     */
    fun isAllowedFileType(fileName: String): Boolean {
        val allowedExtensions = setOf(
            "txt", "md", "json", "csv", "xml", "yaml", "yml",
            "js", "ts", "py", "java", "c", "cpp", "h",
            "html", "css", "scss", "less",
            "png", "jpg", "jpeg", "gif", "svg", "webp",
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
            "zip", "tar", "gz", "rar", "7z",
            "mp3", "mp4", "wav", "avi", "mov"
        )
        val extension = fileName.substringAfterLast(".", "").lowercase()
        return allowedExtensions.contains(extension)
    }

    /**
     * 获取文件图标
     *
     * @param fileName 文件名
     * @return 图标描述字符串
     */
    fun getFileIcon(fileName: String): String {
        return when {
            fileName.endsWith(".pdf", ignoreCase = true) -> "📄"
            fileName.endsWith(".doc", ignoreCase = true) ||
                fileName.endsWith(".docx", ignoreCase = true) -> "📝"
            fileName.endsWith(".xls", ignoreCase = true) ||
                fileName.endsWith(".xlsx", ignoreCase = true) -> "📊"
            fileName.endsWith(".ppt", ignoreCase = true) ||
                fileName.endsWith(".pptx", ignoreCase = true) -> "📽️"
            fileName.endsWith(".jpg", ignoreCase = true) ||
                fileName.endsWith(".jpeg", ignoreCase = true) ||
                fileName.endsWith(".png", ignoreCase = true) ||
                fileName.endsWith(".gif", ignoreCase = true) ||
                fileName.endsWith(".webp", ignoreCase = true) -> "🖼️"
            fileName.endsWith(".mp4", ignoreCase = true) ||
                fileName.endsWith(".avi", ignoreCase = true) ||
                fileName.endsWith(".mov", ignoreCase = true) -> "🎬"
            fileName.endsWith(".mp3", ignoreCase = true) ||
                fileName.endsWith(".wav", ignoreCase = true) -> "🎵"
            fileName.endsWith(".zip", ignoreCase = true) ||
                fileName.endsWith(".tar", ignoreCase = true) ||
                fileName.endsWith(".gz", ignoreCase = true) ||
                fileName.endsWith(".rar", ignoreCase = true) -> "🗜️"
            fileName.endsWith(".js", ignoreCase = true) ||
                fileName.endsWith(".ts", ignoreCase = true) ||
                fileName.endsWith(".py", ignoreCase = true) ||
                fileName.endsWith(".java", ignoreCase = true) ||
                fileName.endsWith(".c", ignoreCase = true) ||
                fileName.endsWith(".cpp", ignoreCase = true) -> "💻"
            fileName.endsWith(".html", ignoreCase = true) ||
                fileName.endsWith(".css", ignoreCase = true) -> "🌐"
            fileName.endsWith(".json", ignoreCase = true) ||
                fileName.endsWith(".xml", ignoreCase = true) ||
                fileName.endsWith(".yaml", ignoreCase = true) ||
                fileName.endsWith(".yml", ignoreCase = true) -> "⚙️"
            fileName.endsWith(".md", ignoreCase = true) ||
                fileName.endsWith(".txt", ignoreCase = true) -> "📃"
            else -> "📎"
        }
    }
}

/**
 * 文件信息数据类
 */
data class FileInfo(
    val name: String,
    val content: ByteArray
) {
    val size: Long get() = content.size.toLong()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as FileInfo
        return name == other.name && content.contentEquals(other.content)
    }

    override fun hashCode(): Int {
        var result = name.hashCode()
        result = 31 * result + content.contentHashCode()
        return result
    }
}

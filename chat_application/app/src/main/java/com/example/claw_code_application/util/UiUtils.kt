package com.example.claw_code_application.util

import android.content.Context
import android.widget.Toast

/**
 * UI工具类
 * 提供通用的UI辅助方法（Toast、错误提示等）
 */
object UiUtils {

    /**
     * 显示Toast消息
     * @param context 上下文
     * @param message 消息内容
     */
    fun showToast(context: Context, message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    /**
     * 格式化错误信息，提供用户友好的提示
     * @param exception 异常对象
     * @return 用户友好的错误消息
     */
    fun formatErrorMessage(exception: Exception): String {
        val message = exception.message ?: "未知错误"
        
        // 常见错误映射到友好提示
        return when {
            message.contains("timeout", ignoreCase = true) -> "网络连接超时，请检查网络"
            message.contains("Unable to resolve host", ignoreCase = true) -> "无法连接服务器，请检查网络"
            message.contains("401", ignoreCase = true) || 
            message.contains("Unauthorized", ignoreCase = true) -> "登录已过期，请重新登录"
            message.contains("403", ignoreCase = true) || 
            message.contains("Forbidden", ignoreCase = true) -> "没有权限执行此操作"
            message.contains("404", ignoreCase = true) || 
            message.contains("Not Found", ignoreCase = true) -> "请求的资源不存在"
            message.contains("500", ignoreCase = true) || 
            message.contains("Server Error", ignoreCase = true) -> "服务器内部错误，请稍后重试"
            else -> message
        }
    }

    /**
     * 验证邮箱格式
     * @param email 邮箱地址
     * @return 是否有效
     */
    fun isValidEmail(email: String): Boolean {
        val emailRegex = "^[A-Za-z](.*)([@]{1})(.{1,})(\\.)(.{1,})$".toRegex()
        return emailRegex.matches(email)
    }

    /**
     * 验证密码强度
     * 密码要求：6-32位，包含字母和数字
     * @param password 密码
     * @return 验证结果（成功返回null，失败返回错误消息）
     */
    fun validatePassword(password: String): String? {
        return when {
            password.isEmpty() -> "密码不能为空"
            password.length < 6 -> "密码长度不能少于6位"
            password.length > 32 -> "密码长度不能超过32位"
            !password.any { it.isDigit() } -> "密码需要包含至少一个数字"
            !password.any { it.isLetter() } -> "密码需要包含至少一个字母"
            else -> null
        }
    }

    /**
     * 防止快速点击（节流）
     * 记录上次点击时间，如果间隔小于阈值则忽略
     */
    private var lastClickTime: Long = 0
    private const val CLICK_THRESHOLD_MS: Long = 500L

    /**
     * 检查是否可以响应点击事件
     * @return 如果距离上次点击超过阈值返回true，否则返回false
     */
    fun canClick(): Boolean {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastClickTime < CLICK_THRESHOLD_MS) {
            return false
        }
        lastClickTime = currentTime
        return true
    }
}

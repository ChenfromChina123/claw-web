package com.example.claw_code_application.data.api

import android.content.Context
import android.content.Intent
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.MainActivity
import com.example.claw_code_application.util.Logger
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * 认证拦截器
 * 
 * 行业标准做法：
 * 1. 自动为请求添加 Authorization Header
 * 2. 检测 401 响应，自动清除 Token 并跳转到登录页
 * 3. 支持 Token 刷新机制（预留）
 */
class AuthInterceptor(
    private val context: Context,
    private val tokenManager: TokenManager
) : Interceptor {

    companion object {
        private const val TAG = "AuthInterceptor"
        
        /** 认证失效回调（用于全局通知） */
        var onAuthFailed: (() -> Unit)? = null
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        
        // 跳过不需要认证的请求
        if (isPublicEndpoint(request.url.toString())) {
            Logger.d(TAG, "公开端点，跳过认证: ${request.url}")
            return chain.proceed(request)
        }

        // 获取当前 Token
        val token = runBlocking { tokenManager.getToken().first() }
        
        // 如果没有 Token，直接请求（让服务器返回 401）
        if (token.isNullOrBlank()) {
            Logger.w(TAG, "请求需要认证但没有 Token: ${request.url}")
            val response = chain.proceed(request)
            
            if (response.code == 401) {
                handleAuthFailure("Token 不存在")
            }
            return response
        }

        // 添加 Authorization Header
        val authenticatedRequest = request.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()

        Logger.d(TAG, "添加认证头: ${request.method} ${request.url}")

        // 发送请求
        val response = chain.proceed(authenticatedRequest)

        // 检测 401 未授权响应
        if (response.code == 401) {
            Logger.w(TAG, "收到 401 响应，Token 可能已过期: ${request.url}")
            handleAuthFailure("Token 过期或无效 (401)")
            
            // 关闭响应体，避免资源泄漏
            response.close()
            
            // 返回原始的 401 响应，让上层处理
            // 不抛出异常，避免崩溃
            Logger.w(TAG, "返回 401 响应给上层处理")
            return Response.Builder()
                .request(request)
                .protocol(okhttp3.Protocol.HTTP_1_1)
                .code(401)
                .message("Unauthorized")
                .body(okhttp3.ResponseBody.create(null, ""))
                .build()
        }

        return response
    }

    /**
     * 处理认证失败
     * 1. 清除本地 Token
     * 2. 跳转到登录页
     * 3. 发送全局通知
     */
    private fun handleAuthFailure(reason: String) {
        Logger.e(TAG, "认证失败: $reason")
        
        // 清除本地存储的 Token
        runBlocking {
            tokenManager.clearToken()
            Logger.i(TAG, "已清除本地 Token")
        }

        // 发送全局通知
        onAuthFailed?.invoke()

        // 跳转到登录页
        navigateToLogin()
    }

    /**
     * 跳转到主页面（会自动处理未登录状态）
     * 使用 FLAG_ACTIVITY_NEW_TASK 和 FLAG_ACTIVITY_CLEAR_TASK 清除任务栈
     */
    private fun navigateToLogin() {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("auth_failed", true)
                putExtra("message", "登录已过期，请重新登录")
            }
            context.startActivity(intent)
            Logger.i(TAG, "已跳转到主页面")
        } catch (e: Exception) {
            Logger.e(TAG, "跳转失败: ${e.message}")
        }
    }

    /**
     * 判断是否为公开端点（不需要认证）
     */
    private fun isPublicEndpoint(url: String): Boolean {
        val publicPaths = listOf(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",  // Token 刷新接口
            "/api/health",
            "/api/info"
        )
        return publicPaths.any { url.contains(it) }
    }
}

/**
 * 认证异常
 * 用于标识因认证失败导致的请求异常
 */
class AuthenticationException(message: String) : Exception(message)

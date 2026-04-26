package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager

/**
 * 认证数据仓库
 * 封装所有认证相关的API调用和Token管理
 */
class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    /**
     * 用户登录
     * @param email 邮箱
     * @param password 密码
     * @return 认证结果（成功返回AuthData，失败抛异常）
     */
    suspend fun login(email: String, password: String): Result<AuthData> {
        return try {
            val response = apiService.login(LoginRequest(email, password))
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    // 保存Token到本地
                    tokenManager.saveToken(body.data.token)
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "登录失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("登录失败: ${e.message}", e))
        }
    }

    /**
     * 用户注册
     * @param email 邮箱
     * @param username 用户名
     * @param password 密码
     * @param code 验证码
     * @return 注册结果
     */
    suspend fun register(
        email: String,
        username: String,
        password: String,
        code: String
    ): Result<AuthData> {
        return try {
            val response = apiService.register(RegisterRequest(email, username, password, code))
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    // 注册成功后自动保存Token
                    tokenManager.saveToken(body.data.token)
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "注册失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("注册失败: ${e.message}", e))
        }
    }

    /**
     * 获取当前用户信息
     * @return 用户信息
     */
    suspend fun getUserInfo(): Result<UserInfo> {
        return try {
            val token = getTokenOrThrow()
            val response = apiService.getUserInfo(token)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "获取用户信息失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("获取用户信息失败: ${e.message}", e))
        }
    }

    /**
     * 登出（清除本地Token）
     */
    suspend fun logout() {
        tokenManager.clearToken()
    }

    /**
     * 获取存储的Token，如果不存在则抛出异常
     */
    private suspend fun getTokenOrThrow(): String {
        return tokenManager.getTokenSync()
            ?.takeIf { it.isNotEmpty() }
            ?: throw Exception("未登录，请先登录")
    }
}

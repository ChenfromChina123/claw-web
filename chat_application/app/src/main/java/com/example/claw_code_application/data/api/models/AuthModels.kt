package com.example.claw_code_application.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * 登录请求体
 */
data class LoginRequest(
    val email: String,
    val password: String
)

/**
 * 注册请求体
 */
data class RegisterRequest(
    val email: String,
    val username: String,
    val password: String,
    val code: String
)

/**
 * API统一响应格式
 */
data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val error: ApiError?
)

/**
 * API错误信息
 */
data class ApiError(
    val code: String,
    val message: String
)

/**
 * 认证响应数据
 * 与后端 /api/auth/login 返回结构匹配
 */
data class AuthData(
    @SerializedName("accessToken")
    val token: String,  // 后端返回 accessToken，映射为 token
    @SerializedName("tokenType")
    val tokenType: String = "Bearer",
    @SerializedName("userId")
    val userId: String,
    @SerializedName("username")
    val username: String,
    @SerializedName("email")
    val email: String,
    @SerializedName("isAdmin")
    val isAdmin: Boolean = false,
    @SerializedName("avatar")
    val avatar: String? = null
)

/**
 * 用户基本信息
 */
data class UserInfo(
    val id: String,
    val email: String,
    val username: String,
    val avatar: String?
)

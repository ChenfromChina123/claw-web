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
 * 认证成功返回的数据（包含token和用户信息）
 */
data class AuthData(
    val token: String,
    val user: UserInfo
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

package com.example.claw_code_application.data.api.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val email: String,
    val username: String,
    val password: String,
    val code: String
)

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val error: ApiError?
)

@Serializable
data class ApiError(
    val code: String,
    val message: String
)

@Serializable
data class AuthData(
    @SerialName("accessToken")
    val token: String,
    @SerialName("tokenType")
    val tokenType: String = "Bearer",
    @SerialName("userId")
    val userId: String,
    @SerialName("username")
    val username: String,
    @SerialName("email")
    val email: String,
    @SerialName("isAdmin")
    val isAdmin: Boolean = false,
    @SerialName("avatar")
    val avatar: String? = null
)

@Serializable
data class UserInfo(
    val id: String,
    val email: String,
    val username: String,
    val avatar: String?
)
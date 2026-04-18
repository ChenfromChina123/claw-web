package com.example.claw_code_application.data.api

import com.example.claw_code_application.data.api.models.*
import retrofit2.Response
import retrofit2.http.*

/**
 * 后端API服务接口定义
 * 基于claw-web Master服务的RESTful API
 */
interface ApiService {

    // ==================== 认证相关 API ====================

    /**
     * 用户登录
     * @param request 登录请求（邮箱+密码）
     * @return 认证响应（包含token和用户信息）
     */
    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<ApiResponse<AuthData>>

    /**
     * 用户注册
     * @param request 注册请求
     * @return 认证响应
     */
    @POST("/api/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<ApiResponse<AuthData>>

    /**
     * 获取当前用户信息
     * @param token Bearer Token
     * @return 用户信息
     */
    @GET("/api/auth/me")
    suspend fun getUserInfo(
        @Header("Authorization") token: String
    ): Response<ApiResponse<UserInfo>>

    // ==================== 会话管理 API ====================

    /**
     * 获取用户会话列表
     * @param token Bearer Token
     * @return 会话列表
     */
    @GET("/api/sessions")
    suspend fun getSessions(
        @Header("Authorization") token: String
    ): Response<ApiResponse<List<Session>>>

    /**
     * 创建新会话
     * @param token Bearer Token
     * @param request 创建会话请求（可选标题和模型）
     * @return 新创建的会话信息
     */
    @POST("/api/sessions")
    suspend fun createSession(
        @Header("Authorization") token: String,
        @Body request: CreateSessionRequest = CreateSessionRequest()
    ): Response<ApiResponse<Session>>

    /**
     * 获取会话详情（含消息历史）
     * @param token Bearer Token
     * @param sessionId 会话ID
     * @return 会话详情（消息+工具调用）
     */
    @GET("/api/sessions/{id}")
    suspend fun getSessionDetail(
        @Header("Authorization") token: String,
        @Path("id") sessionId: String
    ): Response<ApiResponse<SessionDetail>>

    /**
     * 删除会话
     * @param token Bearer Token
     * @param sessionId 会话ID
     */
    @DELETE("/api/sessions/{id}")
    suspend fun deleteSession(
        @Header("Authorization") token: String,
        @Path("id") sessionId: String
    ): Response<ApiResponse<Unit>>

    // ==================== Agent 执行 API ====================

    /**
     * 执行Agent任务（核心API）
     * 发送用户消息，Agent将自动执行工具并返回结果
     * @param token Bearer Token
     * @param request Agent执行请求
     * @return Agent执行结果（消息+工具调用+状态）
     */
    @POST("/api/agents/execute")
    suspend fun executeAgent(
        @Header("Authorization") token: String,
        @Body request: ExecuteAgentRequest
    ): Response<ApiResponse<ExecuteAgentResponse>>

    /**
     * 中断Agent执行
     * @param token Bearer Token
     * @param agentId Agent ID
     */
    @POST("/api/agents/{agentId}/interrupt")
    suspend fun interruptAgent(
        @Header("Authorization") token: String,
        @Path("agentId") agentId: String
    ): Response<ApiResponse<Unit>>
}

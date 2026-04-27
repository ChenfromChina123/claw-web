package com.example.claw_code_application.data.api

import com.example.claw_code_application.data.api.models.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/**
 * 后端API服务接口定义
 * 基于claw-web Master服务的RESTful API
 *
 * 注意：Authorization 头由 AuthInterceptor 统一添加
 * API 方法不再需要手动传递 token 参数
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
     * Authorization 头由 AuthInterceptor 自动添加
     * @return 用户信息
     */
    @GET("/api/auth/me")
    suspend fun getUserInfo(): Response<ApiResponse<UserInfo>>

    // ==================== 会话管理 API ====================

    /**
     * 获取用户会话列表
     * Authorization 头由 AuthInterceptor 自动添加
     * @return 会话列表
     */
    @GET("/api/sessions")
    suspend fun getSessions(): Response<ApiResponse<List<Session>>>

    /**
     * 创建新会话
     * Authorization 头由 AuthInterceptor 自动添加
     * @param request 创建会话请求（可选标题和模型）
     * @return 新创建的会话信息
     */
    @POST("/api/sessions")
    suspend fun createSession(
        @Body request: CreateSessionRequest = CreateSessionRequest()
    ): Response<ApiResponse<Session>>

    /**
     * 获取会话详情（含消息历史）
     * Authorization 头由 AuthInterceptor 自动添加
     * @param sessionId 会话ID
     * @return 会话详情（消息+工具调用）
     */
    @GET("/api/sessions/{id}")
    suspend fun getSessionDetail(
        @Path("id") sessionId: String
    ): Response<ApiResponse<SessionDetail>>

    /**
     * 删除会话
     * Authorization 头由 AuthInterceptor 自动添加
     * @param sessionId 会话ID
     */
    @DELETE("/api/sessions/{id}")
    suspend fun deleteSession(
        @Path("id") sessionId: String
    ): Response<ApiResponse<Unit>>

    // ==================== Agent 执行 API ====================

    /**
     * 执行Agent任务（核心API）
     * Authorization 头由 AuthInterceptor 自动添加
     * @param request Agent执行请求
     * @return Agent执行结果（消息+工具调用+状态）
     */
    @POST("/api/agents/execute")
    suspend fun executeAgent(
        @Body request: ExecuteAgentRequest
    ): Response<ApiResponse<ExecuteAgentResponse>>

    /**
     * 中断Agent执行
     * Authorization 头由 AuthInterceptor 自动添加
     * @param agentId Agent ID
     */
    @POST("/api/agents/{agentId}/interrupt")
    suspend fun interruptAgent(
        @Path("agentId") agentId: String
    ): Response<ApiResponse<Unit>>

    // ==================== 聊天图片 API ====================

    /**
     * 上传聊天图片
     */
    @Multipart
    @POST("/api/chat/images/upload")
    suspend fun uploadChatImage(
        @Part file: MultipartBody.Part,
        @Part("sessionId") sessionId: RequestBody? = null
    ): Response<ApiResponse<ImageUploadResult>>

    /**
     * 获取图片 URL
     */
    fun getImageUrl(imageId: String): String {
        return "${retrofit.baseUrl()}api/chat/images/$imageId"
    }
}

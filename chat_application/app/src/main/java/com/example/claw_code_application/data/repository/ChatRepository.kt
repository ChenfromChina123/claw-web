package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.util.Constants
import com.example.claw_code_application.util.NetworkConfig
import com.example.claw_code_application.util.Logger

/**
 * 聊天数据仓库
 * 封装会话管理和Agent执行相关的API调用
 *
 * 注意：Authorization 头由 AuthInterceptor 统一添加
 * Repository 不再需要手动传递 token 参数
 */
class ChatRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    companion object {
        private const val TAG = "ChatRepository"
    }

    /**
     * 获取会话列表
     * @return 会话列表
     */
    suspend fun getSessions(): Result<List<Session>> {
        Logger.d(TAG, "开始获取会话列表...")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                Logger.w(TAG, "Token 为空，用户未登录")
                return Result.success(emptyList())
            }
            
            Logger.d(TAG, "发送请求到: ${NetworkConfig.getBaseUrl()}/api/sessions")
            
            val response = apiService.getSessions()
            Logger.d(TAG, "收到响应: HTTP ${response.code()}")
            
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                Logger.obj(TAG, "响应体", body)
                
                if (body.success) {
                    val sessions = body.data ?: emptyList()
                    Logger.i(TAG, "获取会话列表成功: 共 ${sessions.size} 个会话")
                    Result.success(sessions)
                } else {
                    val errorMsg = body.error?.message ?: "获取会话列表失败"
                    Logger.e(TAG, "服务器返回错误: $errorMsg")
                    Result.failure(Exception(errorMsg))
                }
            } else if (response.code() == 401) {
                Logger.w(TAG, "收到 401 响应，认证已过期")
                Result.success(emptyList())
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "HTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            if (e.message?.contains("未登录") == true || e.message?.contains("401") == true) {
                Logger.w(TAG, "获取会话列表失败: 用户未登录或认证过期")
                return Result.success(emptyList())
            }
            Logger.e(TAG, "获取会话列表异常", e)
            Result.failure(Exception("获取会话列表失败: ${e.message}", e))
        }
    }

    /**
     * 创建新会话
     * @param title 会话标题（可选）
     * @param model AI模型名称（默认qwen-plus）
     * @return 新创建的会话
     */
    suspend fun createSession(
        title: String? = null,
        model: String = Constants.DEFAULT_MODEL
    ): Result<Session> {
        Logger.d(TAG, "开始创建会话: title=$title, model=$model")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return Result.failure(Exception("未登录，请先登录"))
            }
            
            val request = CreateSessionRequest(title = title, model = model)
            Logger.obj(TAG, "创建会话请求", request)
            
            val response = apiService.createSession(request)
            Logger.d(TAG, "创建会话响应: HTTP ${response.code()}")
            
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Logger.i(TAG, "创建会话成功: id=${body.data.id}")
                    Result.success(body.data)
                } else {
                    val errorMsg = body.error?.message ?: "创建会话失败"
                    Logger.e(TAG, "创建会话失败: $errorMsg")
                    Result.failure(Exception(errorMsg))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "创建会话HTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Logger.e(TAG, "创建会话异常", e)
            Result.failure(Exception("创建会话失败: ${e.message}", e))
        }
    }

    /**
     * 获取会话详情（含消息历史）
     * @param sessionId 会话ID
     * @return 会话详情
     */
    suspend fun getSessionDetail(sessionId: String): Result<SessionDetail> {
        Logger.d(TAG, "开始获取会话详情: sessionId=$sessionId")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return Result.failure(Exception("未登录，请先登录"))
            }
            
            val response = apiService.getSessionDetail(sessionId)
            Logger.d(TAG, "获取会话详情响应: HTTP ${response.code()}")
            
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Logger.i(TAG, "获取会话详情成功")
                    Result.success(body.data)
                } else {
                    val errorMsg = body.error?.message ?: "获取会话详情失败"
                    Logger.e(TAG, "获取会话详情失败: $errorMsg")
                    Result.failure(Exception(errorMsg))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "获取会话详情HTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Logger.e(TAG, "获取会话详情异常", e)
            Result.failure(Exception("获取会话详情失败: ${e.message}", e))
        }
    }

    /**
     * 删除会话
     * @param sessionId 会话ID
     */
    suspend fun deleteSession(sessionId: String): Result<Unit> {
        Logger.d(TAG, "开始删除会话: sessionId=$sessionId")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return Result.failure(Exception("未登录，请先登录"))
            }
            
            val response = apiService.deleteSession(sessionId)
            Logger.d(TAG, "删除会话响应: HTTP ${response.code()}")
            
            if (response.isSuccessful) {
                Logger.i(TAG, "删除会话成功")
                Result.success(Unit)
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "删除会话HTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("删除会话失败: ${response.code()}"))
            }
        } catch (e: Exception) {
            Logger.e(TAG, "删除会话异常", e)
            Result.failure(Exception("删除会话失败: ${e.message}", e))
        }
    }

    /**
     * 执行Agent任务（核心功能）
     * @param sessionId 会话ID
     * @param task 任务描述
     * @param prompt 提示词
     * @param tools 允许使用的工具列表
     * @param maxTurns 最大交互轮次
     * @return Agent执行结果
     */
    suspend fun executeAgent(
        sessionId: String,
        task: String,
        prompt: String,
        tools: List<String> = emptyList(),
        maxTurns: Int? = null
    ): Result<ExecuteAgentResponse> {
        Logger.d(TAG, "开始执行Agent: sessionId=$sessionId, task=$task")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return Result.failure(Exception("未登录，请先登录"))
            }
            
            val request = ExecuteAgentRequest(
                agentId = Constants.DEFAULT_AGENT_ID,
                sessionId = sessionId,
                task = task,
                prompt = prompt,
                tools = tools,
                maxTurns = maxTurns
            )
            Logger.obj(TAG, "Agent执行请求", request)
            
            val response = apiService.executeAgent(request)
            Logger.d(TAG, "Agent执行响应: HTTP ${response.code()}")
            
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Logger.i(TAG, "Agent执行成功")
                    Result.success(body.data)
                } else {
                    val errorMsg = body.error?.message ?: "Agent执行失败"
                    Logger.e(TAG, "Agent执行失败: $errorMsg")
                    Result.failure(Exception(errorMsg))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "Agent执行HTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Logger.e(TAG, "Agent执行异常", e)
            Result.failure(Exception("Agent执行失败: ${e.message}", e))
        }
    }

    /**
     * 中断正在执行的Agent
     * @param agentId Agent ID
     */
    suspend fun interruptAgent(agentId: String = Constants.DEFAULT_AGENT_ID): Result<Unit> {
        Logger.d(TAG, "开始中断Agent: agentId=$agentId")
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return Result.failure(Exception("未登录，请先登录"))
            }
            
            val response = apiService.interruptAgent(agentId)
            Logger.d(TAG, "中断Agent响应: HTTP ${response.code()}")
            
            if (response.isSuccessful) {
                Logger.i(TAG, "中断Agent成功")
                Result.success(Unit)
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "中断AgentHTTP错误: ${response.code()}, 错误内容: $errorBody")
                Result.failure(Exception("中断Agent失败: ${response.code()}"))
            }
        } catch (e: Exception) {
            Logger.e(TAG, "中断Agent异常", e)
            Result.failure(Exception("中断Agent失败: ${e.message}", e))
        }
    }
}

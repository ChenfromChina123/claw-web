package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.util.Constants

/**
 * 聊天数据仓库
 * 封装会话管理和Agent执行相关的API调用
 */
class ChatRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    /**
     * 获取会话列表
     * @return 会话列表
     */
    suspend fun getSessions(): Result<List<Session>> {
        return try {
            val token = getTokenOrThrow()
            val response = apiService.getSessions(token)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success) {
                    Result.success(body.data ?: emptyList())
                } else {
                    Result.failure(Exception(body.error?.message ?: "获取会话列表失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
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
        return try {
            val token = getTokenOrThrow()
            val response = apiService.createSession(
                token,
                CreateSessionRequest(title = title, model = model)
            )
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "创建会话失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("创建会话失败: ${e.message}", e))
        }
    }

    /**
     * 获取会话详情（含消息历史）
     * @param sessionId 会话ID
     * @return 会话详情
     */
    suspend fun getSessionDetail(sessionId: String): Result<SessionDetail> {
        return try {
            val token = getTokenOrThrow()
            val response = apiService.getSessionDetail(token, sessionId)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "获取会话详情失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("获取会话详情失败: ${e.message}", e))
        }
    }

    /**
     * 删除会话
     * @param sessionId 会话ID
     */
    suspend fun deleteSession(sessionId: String): Result<Unit> {
        return try {
            val token = getTokenOrThrow()
            val response = apiService.deleteSession(token, sessionId)
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("删除会话失败: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("删除会话失败: ${e.message}", e))
        }
    }

    /**
     * 执行Agent任务（核心功能）
     * 发送用户消息，Agent将自动执行工具并返回结果
     * @param sessionId 会话ID
     * @param task 任务描述（用户原始输入）
     * @param prompt 提示词（发送给AI的完整提示）
     * @param tools 允许使用的工具列表（空表示使用所有可用工具）
     * @param maxTurns 最大交互轮次（null表示使用默认值）
     * @return Agent执行结果
     */
    suspend fun executeAgent(
        sessionId: String,
        task: String,
        prompt: String,
        tools: List<String> = emptyList(),
        maxTurns: Int? = null
    ): Result<ExecuteAgentResponse> {
        return try {
            val token = getTokenOrThrow()
            val request = ExecuteAgentRequest(
                agentId = Constants.DEFAULT_AGENT_ID,
                sessionId = sessionId,
                task = task,
                prompt = prompt,
                tools = tools,
                maxTurns = maxTurns
            )
            
            val response = apiService.executeAgent(token, request)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.error?.message ?: "Agent执行失败"))
                }
            } else {
                Result.failure(Exception("网络错误: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Agent执行失败: ${e.message}", e))
        }
    }

    /**
     * 中断正在执行的Agent
     * @param agentId Agent ID（默认"default"）
     */
    suspend fun interruptAgent(agentId: String = Constants.DEFAULT_AGENT_ID): Result<Unit> {
        return try {
            val token = getTokenOrThrow()
            val response = apiService.interruptAgent(token, agentId)
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("中断Agent失败: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("中断Agent失败: ${e.message}", e))
        }
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

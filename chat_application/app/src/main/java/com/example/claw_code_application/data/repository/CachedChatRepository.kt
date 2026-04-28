package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.CreateSessionRequest
import com.example.claw_code_application.data.api.models.ExecuteAgentRequest
import com.example.claw_code_application.data.api.models.ExecuteAgentResponse
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.data.api.models.SessionDetail
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.local.db.AppDatabase
import com.example.claw_code_application.data.local.db.EntityMappers.toCacheData
import com.example.claw_code_application.data.local.db.EntityMappers.toEntity
import com.example.claw_code_application.data.local.db.EntityMappers.toMessageEntities
import com.example.claw_code_application.data.local.db.EntityMappers.toMessages
import com.example.claw_code_application.data.local.db.EntityMappers.toSession
import com.example.claw_code_application.data.local.db.EntityMappers.toSessionEntities
import com.example.claw_code_application.data.local.db.EntityMappers.toSessions
import com.example.claw_code_application.data.local.db.EntityMappers.toToolCallEntities
import com.example.claw_code_application.data.local.db.EntityMappers.toToolCalls
import com.example.claw_code_application.data.local.db.MessageDao
import com.example.claw_code_application.data.local.db.SessionDao
import com.example.claw_code_application.data.local.db.ToolCallDao
import com.example.claw_code_application.util.Constants
import com.example.claw_code_application.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * 带本地缓存的聊天数据仓库
 * 实现"离线优先 + 后台同步"策略：
 * 1. 首次/无缓存：从网络获取并缓存
 * 2. 有缓存：先显示本地数据，后台更新
 * 3. 离线时：只返回本地缓存
 *
 * 使用 Flow 实现响应式数据流
 */
class CachedChatRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager,
    private val sessionDao: SessionDao,
    private val messageDao: MessageDao,
    private val toolCallDao: ToolCallDao
) {
    companion object {
        private const val TAG = "CachedChatRepository"
        
        /**
         * 缓存过期时间（毫秒）- 默认24小时
         */
        private const val CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000L
        
        /**
         * 最小缓存时间（毫秒）- 防止频繁刷新
         */
        private const val MIN_CACHE_AGE_MS = 60 * 1000L
    }

    /**
     * 缓存策略
     */
    enum class CacheStrategy {
        /**
         * 仅网络（实时性要求高的数据）
         */
        NETWORK_ONLY,
        
        /**
         * 本地优先（默认）- 先缓存后网络
         */
        LOCAL_FIRST,
        
        /**
         * 只从网络获取并更新缓存
         */
        NETWORK_FIRST
    }

    /**
     * 数据加载结果
     */
    sealed class Result<out T> {
        data class Success<T>(val data: T) : Result<T>()
        data class Error(val message: String, val exception: Throwable? = null) : Result<Error>()
        data object Loading : Result<Nothing>()
    }

    /**
     * 混合数据结果（包含缓存标记）
     */
    data class CacheResult<T>(
        val data: T,
        val isFromCache: Boolean,
        val lastUpdated: Long? = null
    )

    // ==================== 会话列表 ====================

    /**
     * 获取会话列表（缓存优先）
     * @param forceRefresh 是否强制从网络刷新
     */
    fun getSessions(forceRefresh: Boolean = false): Flow<Result<List<Session>>> = flow {
        emit(Result.Loading)
        
        try {
            // 1. 尝试从本地缓存获取
            val localSessions = sessionDao.getAllSessionsOnce()
            
            // 2. 如果有缓存且不强制刷新，先发射缓存数据
            if (localSessions.isNotEmpty() && !forceRefresh) {
                Logger.d(TAG, "发射本地缓存: ${localSessions.size} 个会话")
                emit(Result.Success(localSessions.toSessions()))
            }
            
            // 3. 后台从网络获取最新数据
            val remoteSessions = fetchSessionsFromNetwork()
            
            if (remoteSessions != null) {
                // 4. 更新本地缓存
                sessionDao.insertSessions(remoteSessions.toSessionEntities())
                Logger.d(TAG, "更新本地缓存: ${remoteSessions.size} 个会话")
                
                // 5. 发射最新数据
                emit(Result.Success(remoteSessions))
            } else if (localSessions.isEmpty()) {
                // 6. 网络失败且无缓存，返回错误
                emit(Result.Error("无法加载会话列表，请检查网络连接"))
            }
            // 如果网络失败但有缓存，已经在上面发射过了
            
        } catch (e: Exception) {
            Logger.e(TAG, "获取会话列表异常", e)
            val localSessions = sessionDao.getAllSessionsOnce()
            if (localSessions.isNotEmpty()) {
                Logger.d(TAG, "异常时使用本地缓存: ${localSessions.size} 个会话")
                emit(Result.Success(localSessions.toSessions()))
            } else {
                emit(Result.Error(e.message ?: "加载失败", e))
            }
        }
    }.flowOn(Dispatchers.IO)

    /**
     * 获取会话列表（响应式 Flow 版本）
     * 监听本地数据库变化，自动更新
     */
    fun observeSessions(): Flow<List<Session>> {
        return sessionDao.getAllSessions()
            .map { entities -> entities.toSessions() }
            .flowOn(Dispatchers.IO)
    }

    /**
     * 同步会话列表（一次性）
     * @return 同步结果
     */
    suspend fun syncSessions(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val remoteSessions = fetchSessionsFromNetwork()
            if (remoteSessions != null) {
                sessionDao.insertSessions(remoteSessions.toSessionEntities())
                Logger.i(TAG, "会话列表同步成功: ${remoteSessions.size} 个会话")
                Result.Success(Unit)
            } else {
                Result.Error("同步失败")
            }
        } catch (e: Exception) {
            Logger.e(TAG, "会话列表同步失败", e)
            Result.Error(e.message ?: "同步失败", e)
        }
    }

    // ==================== 会话详情 ====================

    /**
     * 获取会话详情（缓存优先）
     * @param sessionId 会话ID
     * @param forceRefresh 是否强制从网络刷新
     */
    fun getSessionDetail(
        sessionId: String,
        forceRefresh: Boolean = false
    ): Flow<Result<SessionDetail>> = flow {
        emit(Result.Loading)
        
        try {
            // 1. 更新最后访问时间
            sessionDao.updateLastAccessedAt(sessionId, System.currentTimeMillis())
            
            // 2. 尝试从本地缓存获取
            val localSession = sessionDao.getSessionById(sessionId)
            val localMessages = messageDao.getMessagesBySessionOnce(sessionId)
            val localToolCalls = toolCallDao.getToolCallsBySessionOnce(sessionId)
            
            // 3. 如果有缓存且不强制刷新，先发射缓存数据
            if (localSession != null && localMessages.isNotEmpty() && !forceRefresh) {
                val cachedDetail = SessionDetail(
                    session = localSession.toSession(),
                    messages = localMessages.toMessages(),
                    toolCalls = localToolCalls.toToolCalls()
                )
                Logger.d(TAG, "发射会话缓存: sessionId=$sessionId, ${localMessages.size} 条消息")
                emit(Result.Success(cachedDetail))
            }
            
            // 4. 后台从网络获取最新数据
            val remoteDetail = fetchSessionDetailFromNetwork(sessionId)
            
            if (remoteDetail != null) {
                // 5. 更新本地缓存
                val (sessionEntity, messageEntities, toolCallEntities) = remoteDetail.toCacheData()
                sessionDao.insertSession(sessionEntity)
                messageDao.insertMessages(messageEntities)
                toolCallDao.insertToolCalls(toolCallEntities)
                Logger.d(TAG, "更新会话缓存: sessionId=$sessionId, ${remoteDetail.messages.size} 条消息")
                
                // 6. 发射最新数据
                emit(Result.Success(remoteDetail))
            } else if (localSession == null) {
                // 7. 网络失败且无缓存，返回错误
                emit(Result.Error("无法加载会话详情，请检查网络连接"))
            }
            // 如果网络失败但有缓存，已经在上面发射过了
            
        } catch (e: Exception) {
            Logger.e(TAG, "获取会话详情异常: sessionId=$sessionId", e)
            val localSession = sessionDao.getSessionById(sessionId)
            val localMessages = messageDao.getMessagesBySessionOnce(sessionId)
            val localToolCalls = toolCallDao.getToolCallsBySessionOnce(sessionId)
            
            if (localSession != null) {
                val cachedDetail = SessionDetail(
                    session = localSession.toSession(),
                    messages = localMessages.toMessages(),
                    toolCalls = localToolCalls.toToolCalls()
                )
                Logger.d(TAG, "异常时使用本地缓存")
                emit(Result.Success(cachedDetail))
            } else {
                emit(Result.Error(e.message ?: "加载失败", e))
            }
        }
    }.flowOn(Dispatchers.IO)

    /**
     * 监听会话消息变化（响应式）
     */
    fun observeMessages(sessionId: String): Flow<List<Message>> {
        return messageDao.getMessagesBySession(sessionId)
            .map { entities -> entities.toMessages() }
            .flowOn(Dispatchers.IO)
    }

    /**
     * 监听工具调用变化（响应式）
     */
    fun observeToolCalls(sessionId: String): Flow<List<ToolCall>> {
        return toolCallDao.getToolCallsBySession(sessionId)
            .map { entities -> entities.toToolCalls() }
            .flowOn(Dispatchers.IO)
    }

    // ==================== 消息操作 ====================

    /**
     * 保存消息到本地缓存
     */
    suspend fun saveMessages(sessionId: String, messages: List<Message>) = withContext(Dispatchers.IO) {
        messageDao.insertMessages(messages.toMessageEntities(sessionId))
        Logger.d(TAG, "保存消息到缓存: sessionId=$sessionId, ${messages.size} 条")
    }

    /**
     * 保存工具调用到本地缓存
     */
    suspend fun saveToolCalls(sessionId: String, toolCalls: List<ToolCall>) = withContext(Dispatchers.IO) {
        toolCallDao.insertToolCalls(toolCalls.toToolCallEntities(sessionId, null))
        Logger.d(TAG, "保存工具调用到缓存: sessionId=$sessionId, ${toolCalls.size} 个")
    }

    // ==================== 会话操作 ====================

    /**
     * 创建会话并缓存
     */
    suspend fun createSession(title: String?, model: String): Result<Session> = withContext(Dispatchers.IO) {
        try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return@withContext Result.Error("未登录，请先登录")
            }

            val response = apiService.createSession(
                CreateSessionRequest(title, model)
            )

            if (response.isSuccessful && response.body()?.data != null) {
                val session = response.body()!!.data!!
                sessionDao.insertSession(session.toEntity())
                Logger.i(TAG, "创建会话成功并缓存: ${session.id}")
                Result.Success(session)
            } else {
                Result.Error(response.errorBody()?.string() ?: "创建会话失败")
            }
        } catch (e: Exception) {
            Logger.e(TAG, "创建会话失败", e)
            Result.Error(e.message ?: "创建会话失败", e)
        }
    }

    /**
     * 删除会话（包括缓存）
     */
    suspend fun deleteSession(sessionId: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return@withContext Result.Error("未登录，请先登录")
            }

            val response = apiService.deleteSession(sessionId)

            if (response.isSuccessful) {
                sessionDao.deleteSession(sessionId)
                messageDao.deleteMessagesBySession(sessionId)
                toolCallDao.deleteToolCallsBySession(sessionId)
                Logger.i(TAG, "删除会话成功并清除缓存: $sessionId")
                Result.Success(Unit)
            } else {
                Result.Error("删除会话失败: ${response.code()}")
            }
        } catch (e: Exception) {
            Logger.e(TAG, "删除会话失败", e)
            Result.Error(e.message ?: "删除会话失败", e)
        }
    }

    // ==================== Agent执行 ====================

    /**
     * 执行Agent任务
     */
    suspend fun executeAgent(
        sessionId: String,
        task: String,
        prompt: String,
        tools: List<String> = emptyList(),
        maxTurns: Int? = null
    ): Result<ExecuteAgentResponse> = withContext(Dispatchers.IO) {
        try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return@withContext Result.Error("未登录，请先登录")
            }

            val request = ExecuteAgentRequest(
                agentId = Constants.DEFAULT_AGENT_ID,
                sessionId = sessionId,
                task = task,
                prompt = prompt,
                tools = tools,
                maxTurns = maxTurns
            )

            val response = apiService.executeAgent(request)

            if (response.isSuccessful && response.body()?.data != null) {
                Logger.i(TAG, "Agent执行成功")
                Result.Success(response.body()!!.data!!)
            } else {
                val errorBody = response.errorBody()?.string()
                Logger.e(TAG, "Agent执行失败: HTTP ${response.code()}, $errorBody")
                Result.Error("Agent执行失败: ${response.code()}")
            }
        } catch (e: Exception) {
            Logger.e(TAG, "Agent执行异常", e)
            Result.Error(e.message ?: "Agent执行失败", e)
        }
    }

    /**
     * 中断Agent执行
     */
    suspend fun interruptAgent(agentId: String = Constants.DEFAULT_AGENT_ID): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                return@withContext Result.Error("未登录，请先登录")
            }

            val response = apiService.interruptAgent(agentId)

            if (response.isSuccessful) {
                Logger.i(TAG, "中断Agent成功")
                Result.Success(Unit)
            } else {
                Result.Error("中断Agent失败: ${response.code()}")
            }
        } catch (e: Exception) {
            Logger.e(TAG, "中断Agent异常", e)
            Result.Error(e.message ?: "中断Agent失败", e)
        }
    }

    // ==================== 缓存清理 ====================

    /**
     * 清理过期缓存
     */
    suspend fun clearExpiredCache() = withContext(Dispatchers.IO) {
        val threshold = System.currentTimeMillis() - CACHE_EXPIRY_MS
        sessionDao.deleteOldSessions(threshold)
        messageDao.deleteOldMessages(threshold)
        toolCallDao.deleteOldToolCalls(threshold)
        Logger.i(TAG, "清理过期缓存完成")
    }

    /**
     * 清理所有缓存
     */
    suspend fun clearAllCache() = withContext(Dispatchers.IO) {
        sessionDao.deleteAllSessions()
        Logger.i(TAG, "清理所有会话缓存")
    }

    // ==================== 网络请求 ====================

    private suspend fun fetchSessionsFromNetwork(): List<Session>? {
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                Logger.w(TAG, "Token为空，跳过网络请求")
                return null
            }
            
            val response = apiService.getSessions()
            if (response.isSuccessful) {
                response.body()?.data
            } else {
                Logger.w(TAG, "获取会话列表失败: HTTP ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Logger.e(TAG, "获取会话列表异常", e)
            null
        }
    }

    private suspend fun fetchSessionDetailFromNetwork(sessionId: String): SessionDetail? {
        return try {
            val token = tokenManager.getTokenSync()
            if (token.isNullOrBlank()) {
                Logger.w(TAG, "Token为空，跳过网络请求")
                return null
            }
            
            val response = apiService.getSessionDetail(sessionId)
            if (response.isSuccessful) {
                response.body()?.data
            } else {
                Logger.w(TAG, "获取会话详情失败: HTTP ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Logger.e(TAG, "获取会话详情异常", e)
            null
        }
    }
}

// ==================== 扩展函数 ====================

// 直接使用 EntityMappers 中的扩展函数

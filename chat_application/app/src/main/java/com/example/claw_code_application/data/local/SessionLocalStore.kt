package com.example.claw_code_application.data.local

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 会话本地存储管理器（MMKV优化版）
 * 使用腾讯MMKV替代EncryptedSharedPreferences，读写性能提升10~100倍
 *
 * 微信架构思想：高频访问的会话状态使用高性能存储，确保应用重建后能快速恢复会话上下文
 *
 * 使用MMKV默认实例存储（非敏感数据）
 */
class SessionLocalStore(private val context: Context) {

    /** 会话ID状态流，用于响应式UI更新 */
    private val _sessionFlow = MutableStateFlow<String?>(null)
    val sessionFlow: Flow<String?> = _sessionFlow.asStateFlow()

    init {
        // 初始化时从MMKV读取会话ID
        _sessionFlow.value = getSessionIdSync()
    }

    /**
     * 保存当前会话ID到MMKV存储
     * 同步写入，立即返回，性能极快
     *
     * @param sessionId 会话ID
     */
    suspend fun saveSessionId(sessionId: String) {
        // 使用MMKV默认实例存储非敏感数据
        val success = MMKVManager.putString(KEY_CURRENT_SESSION_ID, sessionId)

        // 同步到状态流
        _sessionFlow.value = sessionId

        android.util.Log.d(TAG, "会话ID保存: $sessionId, 结果: $success")
    }

    /**
     * 获取存储的会话ID（Flow响应式版本）
     *
     * @return 会话ID Flow，如果不存在则为null
     */
    fun getSessionId(): Flow<String?> {
        return sessionFlow
    }

    /**
     * 同步获取存储的会话ID
     * 直接从MMKV读取，无阻塞，性能极快
     *
     * @return 会话ID字符串，如果不存在则返回null
     */
    fun getSessionIdSync(): String? {
        return MMKVManager.getString(KEY_CURRENT_SESSION_ID)
    }

    /**
     * 清除存储的会话ID
     */
    suspend fun clearSessionId() {
        MMKVManager.remove(KEY_CURRENT_SESSION_ID)
        _sessionFlow.value = null
        android.util.Log.d(TAG, "会话ID已清除")
    }

    companion object {
        private const val KEY_CURRENT_SESSION_ID = "current_session_id"
        private const val TAG = "SessionLocalStore"

        @Volatile
        private var INSTANCE: SessionLocalStore? = null

        /**
         * 获取SessionLocalStore单例
         *
         * @param context 应用上下文
         * @return SessionLocalStore 实例
         */
        fun getInstance(context: Context): SessionLocalStore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SessionLocalStore(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

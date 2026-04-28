package com.example.claw_code_application.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.example.claw_code_application.util.Constants
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * 会话本地存储管理器
 * 复用TokenManager的DataStore实例，避免多实例冲突
 * 使用DataStore持久化当前会话ID，确保应用重建后能恢复会话上下文
 */
class SessionLocalStore(private val dataStore: DataStore<Preferences>) {

    /** 当前会话ID键 */
    private val sessionIdKey = stringPreferencesKey(Constants.KEY_CURRENT_SESSION_ID)

    /**
     * 保存当前会话ID到本地存储
     * @param sessionId 会话ID
     */
    suspend fun saveSessionId(sessionId: String) {
        dataStore.edit { preferences ->
            preferences[sessionIdKey] = sessionId
        }
    }

    /**
     * 获取存储的会话ID
     * @return 会话ID Flow，如果不存在则为null
     */
    fun getSessionId(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[sessionIdKey]
        }
    }

    /**
     * 同步获取存储的会话ID
     * @return 会话ID字符串，如果不存在则返回null
     */
    suspend fun getSessionIdSync(): String? {
        return dataStore.data.first()[sessionIdKey]
    }

    /**
     * 清除存储的会话ID
     */
    suspend fun clearSessionId() {
        dataStore.edit { preferences ->
            preferences.remove(sessionIdKey)
        }
    }

    companion object {
        private const val TAG = "SessionLocalStore"
        @Volatile
        private var INSTANCE: SessionLocalStore? = null

        /**
         * 获取SessionLocalStore单例
         * @param dataStore 共享的DataStore实例（来自TokenManager）
         */
        fun getInstance(dataStore: DataStore<Preferences>): SessionLocalStore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SessionLocalStore(dataStore).also { INSTANCE = it }
            }
        }
    }
}

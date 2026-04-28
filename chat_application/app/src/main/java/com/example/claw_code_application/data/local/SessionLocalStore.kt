package com.example.claw_code_application.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.claw_code_application.util.Constants
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * 会话本地存储管理器
 * 使用DataStore持久化当前会话ID，确保应用重建后能恢复会话上下文
 */
class SessionLocalStore(private val context: Context) {

    /** DataStore实例（复用auth_prefs） */
    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = Constants.PREFS_NAME)

    /** 当前会话ID键 */
    private val sessionIdKey = stringPreferencesKey(Constants.KEY_CURRENT_SESSION_ID)

    /**
     * 保存当前会话ID到本地存储
     * @param sessionId 会话ID
     */
    suspend fun saveSessionId(sessionId: String) {
        context.dataStore.edit { preferences ->
            preferences[sessionIdKey] = sessionId
        }
    }

    /**
     * 获取存储的会话ID
     * @return 会话ID Flow，如果不存在则为null
     */
    fun getSessionId(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[sessionIdKey]
        }
    }

    /**
     * 同步获取存储的会话ID
     * @return 会话ID字符串，如果不存在则返回null
     */
    suspend fun getSessionIdSync(): String? {
        return context.dataStore.data.first()[sessionIdKey]
    }

    /**
     * 清除存储的会话ID
     */
    suspend fun clearSessionId() {
        context.dataStore.edit { preferences ->
            preferences.remove(sessionIdKey)
        }
    }

    companion object {
        private const val TAG = "SessionLocalStore"
        @Volatile
        private var INSTANCE: SessionLocalStore? = null

        /**
         * 获取SessionLocalStore单例
         * 双重检查锁定确保线程安全
         */
        fun getInstance(context: Context): SessionLocalStore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SessionLocalStore(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

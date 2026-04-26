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
 * Token本地存储管理器
 * 使用DataStore安全存储认证Token
 */
class TokenManager(private val context: Context) {

    /** DataStore实例 */
    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = Constants.PREFS_NAME)

    /** Token键 */
    private val tokenKey = stringPreferencesKey(Constants.KEY_AUTH_TOKEN)

    /**
     * 保存Token到本地存储
     * @param token 认证Token
     */
    suspend fun saveToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[tokenKey] = token
        }
    }

    /**
     * 获取存储的Token
     * @return Token字符串，如果不存在则返回null
     */
    fun getToken(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[tokenKey]
        }
    }

    /**
     * 同步获取Token（协变版本）
     * @return Token字符串，如果不存在则返回null
     */
    suspend fun getTokenSync(): String? {
        return context.dataStore.data.first()[tokenKey]
    }

    /**
     * 清除存储的Token（用于登出）
     */
    suspend fun clearToken() {
        context.dataStore.edit { preferences ->
            preferences.remove(tokenKey)
        }
    }

    companion object {
        @Volatile
        private var INSTANCE: TokenManager? = null

        /**
         * 获取TokenManager单例
         * 双重检查锁定确保线程安全
         */
        fun getInstance(context: Context): TokenManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TokenManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

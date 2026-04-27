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
        android.util.Log.d(TAG, "=== saveToken ===")
        android.util.Log.d(TAG, "Token 长度: ${token.length}")
        android.util.Log.d(TAG, "Token 前80字符: ${token.take(80)}")
        android.util.Log.d(TAG, "Token 后20字符: ${token.takeLast(20)}")
        
        context.dataStore.edit { preferences ->
            preferences[tokenKey] = token
        }
        
        // 立即验证保存是否成功
        val saved = context.dataStore.first()[tokenKey]
        android.util.Log.d(TAG, "验证保存: ${saved == token}")
        android.util.Log.d(TAG, "读取长度: ${saved?.length}")
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
        val token = context.dataStore.data.first()[tokenKey]
        android.util.Log.d(TAG, "=== getTokenSync ===")
        android.util.Log.d(TAG, "Token: ${if (token != null) "存在(${token.length}字符)" else "null"}")
        if (token != null) {
            android.util.Log.d(TAG, "前80字符: ${token.take(80)}")
        }
        return token
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
        private const val TAG = "TokenManager"
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

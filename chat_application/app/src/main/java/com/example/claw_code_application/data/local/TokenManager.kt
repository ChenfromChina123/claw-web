package com.example.claw_code_application.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.example.claw_code_application.util.Constants
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Token本地存储管理器
 * 使用EncryptedSharedPreferences安全存储认证Token
 * 采用AES-256-GCM加密，密钥由Android Keystore硬件级保护
 */
class TokenManager(private val context: Context) {

    /** EncryptedSharedPreferences实例 */
    private val encryptedPrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * 保存Token到本地加密存储
     * @param token 认证Token
     */
    suspend fun saveToken(token: String) {
        android.util.Log.d(TAG, "=== saveToken ===")
        android.util.Log.d(TAG, "Token 长度: ${token.length}")
        android.util.Log.d(TAG, "Token 前80字符: ${token.take(80)}")
        android.util.Log.d(TAG, "Token 后20字符: ${token.takeLast(20)}")

        encryptedPrefs.edit().putString(KEY_AUTH_TOKEN, token).apply()

        val saved = encryptedPrefs.getString(KEY_AUTH_TOKEN, null)
        android.util.Log.d(TAG, "验证保存: ${saved == token}")
        android.util.Log.d(TAG, "读取长度: ${saved?.length ?: 0}")
    }

    /**
     * 获取存储的Token（Flow响应式版本）
     * @return Token字符串Flow，如果不存在则返回null
     */
    fun getToken(): Flow<String?> {
        return callbackFlow {
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == KEY_AUTH_TOKEN) {
                    trySend(encryptedPrefs.getString(KEY_AUTH_TOKEN, null))
                }
            }
            encryptedPrefs.registerOnSharedPreferenceChangeListener(listener)
            send(encryptedPrefs.getString(KEY_AUTH_TOKEN, null))
            awaitClose {
                encryptedPrefs.unregisterOnSharedPreferenceChangeListener(listener)
            }
        }
    }

    /**
     * 同步获取Token
     * @return Token字符串，如果不存在则返回null
     */
    suspend fun getTokenSync(): String? {
        val token = encryptedPrefs.getString(KEY_AUTH_TOKEN, null)
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
        encryptedPrefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    companion object {
        private const val TAG = "TokenManager"
        private const val PREFS_NAME = "claw_secure_prefs"
        private const val KEY_AUTH_TOKEN = "auth_token"
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

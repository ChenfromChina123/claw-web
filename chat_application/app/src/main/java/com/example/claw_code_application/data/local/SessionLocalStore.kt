package com.example.claw_code_application.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.example.claw_code_application.util.Constants
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * 会话本地存储管理器
 * 使用EncryptedSharedPreferences持久化当前会话ID，确保应用重建后能恢复会话上下文
 * 复用TokenManager的加密存储实例以共享同一个加密上下文
 */
class SessionLocalStore(private val context: Context) {

    /** EncryptedSharedPreferences实例（共享TokenManager的加密存储） */
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
     * 保存当前会话ID到本地加密存储
     * @param sessionId 会话ID
     */
    suspend fun saveSessionId(sessionId: String) {
        encryptedPrefs.edit().putString(KEY_CURRENT_SESSION_ID, sessionId).apply()
    }

    /**
     * 获取存储的会话ID（Flow响应式版本）
     * @return 会话ID Flow，如果不存在则为null
     */
    fun getSessionId(): Flow<String?> {
        return callbackFlow {
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == KEY_CURRENT_SESSION_ID) {
                    trySend(encryptedPrefs.getString(KEY_CURRENT_SESSION_ID, null))
                }
            }
            encryptedPrefs.registerOnSharedPreferenceChangeListener(listener)
            send(encryptedPrefs.getString(KEY_CURRENT_SESSION_ID, null))
            awaitClose {
                encryptedPrefs.unregisterOnSharedPreferenceChangeListener(listener)
            }
        }
    }

    /**
     * 同步获取存储的会话ID
     * @return 会话ID字符串，如果不存在则返回null
     */
    suspend fun getSessionIdSync(): String? {
        return encryptedPrefs.getString(KEY_CURRENT_SESSION_ID, null)
    }

    /**
     * 清除存储的会话ID
     */
    suspend fun clearSessionId() {
        encryptedPrefs.edit().remove(KEY_CURRENT_SESSION_ID).apply()
    }

    companion object {
        private const val TAG = "SessionLocalStore"
        private const val PREFS_NAME = "claw_secure_prefs"
        private const val KEY_CURRENT_SESSION_ID = "current_session_id"
        @Volatile
        private var INSTANCE: SessionLocalStore? = null

        /**
         * 获取SessionLocalStore单例
         * @param context 应用上下文
         */
        fun getInstance(context: Context): SessionLocalStore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SessionLocalStore(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

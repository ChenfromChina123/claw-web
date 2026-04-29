package com.example.claw_code_application.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.example.claw_code_application.data.api.models.UserInfo
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * 用户信息本地存储管理器
 * 使用EncryptedSharedPreferences安全存储用户信息
 * 采用AES-256-GCM加密，密钥由Android Keystore硬件级保护
 */
class UserManager(private val context: Context) {

    /** JSON序列化器 */
    private val json = Json { ignoreUnknownKeys = true }

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
     * 保存用户信息到本地加密存储
     * @param userInfo 用户信息
     */
    suspend fun saveUserInfo(userInfo: UserInfo) {
        val userJson = json.encodeToString(userInfo)
        encryptedPrefs.edit().putString(KEY_USER_INFO, userJson).apply()
    }

    /**
     * 获取存储的用户信息（Flow响应式版本）
     * @return 用户信息Flow，如果不存在则返回null
     */
    fun getUserInfo(): Flow<UserInfo?> {
        return callbackFlow {
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == KEY_USER_INFO) {
                    trySend(loadUserInfo())
                }
            }
            encryptedPrefs.registerOnSharedPreferenceChangeListener(listener)
            send(loadUserInfo())
            awaitClose {
                encryptedPrefs.unregisterOnSharedPreferenceChangeListener(listener)
            }
        }
    }

    /**
     * 同步获取用户信息
     * @return 用户信息，如果不存在则返回null
     */
    suspend fun getUserInfoSync(): UserInfo? {
        return loadUserInfo()
    }

    /**
     * 从SharedPreferences加载用户信息
     * @return 用户信息，如果不存在或解析失败则返回null
     */
    private fun loadUserInfo(): UserInfo? {
        val userJson = encryptedPrefs.getString(KEY_USER_INFO, null)
        return if (userJson != null) {
            try {
                json.decodeFromString<UserInfo>(userJson)
            } catch (e: Exception) {
                android.util.Log.e(TAG, "解析用户信息失败", e)
                null
            }
        } else {
            null
        }
    }

    /**
     * 清除存储的用户信息（用于登出）
     */
    suspend fun clearUserInfo() {
        encryptedPrefs.edit().remove(KEY_USER_INFO).apply()
    }

    /**
     * 检查用户是否已登录
     * @return 如果存在用户信息则返回true
     */
    suspend fun isLoggedIn(): Boolean {
        return getUserInfoSync() != null
    }

    companion object {
        private const val TAG = "UserManager"
        private const val PREFS_NAME = "claw_user_prefs"
        private const val KEY_USER_INFO = "user_info"
        @Volatile
        private var INSTANCE: UserManager? = null

        /**
         * 获取UserManager单例
         * 双重检查锁定确保线程安全
         */
        fun getInstance(context: Context): UserManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: UserManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

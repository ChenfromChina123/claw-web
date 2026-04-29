package com.example.claw_code_application.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * 主题偏好设置存储管理器
 * 使用 EncryptedSharedPreferences 持久化用户选择的主题模式
 * 
 * 支持的主题模式：
 * - LIGHT: 浅色模式
 * - DARK: 深色模式
 * - SYSTEM: 跟随系统（默认）
 */
class ThemePreferencesStore(private val context: Context) {

    /** EncryptedSharedPreferences 实例 */
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
     * 保存主题模式到本地加密存储
     * 
     * @param themeMode 主题模式字符串（LIGHT, DARK, SYSTEM）
     */
    suspend fun saveThemeMode(themeMode: String) {
        encryptedPrefs.edit().putString(KEY_THEME_MODE, themeMode).apply()
    }

    /**
     * 获取存储的主题模式（Flow 响应式版本）
     * 
     * @return 主题模式 Flow，如果不存在则返回默认值 SYSTEM
     */
    fun getThemeMode(): Flow<String> {
        return callbackFlow {
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == KEY_THEME_MODE) {
                    trySend(encryptedPrefs.getString(KEY_THEME_MODE, DEFAULT_THEME_MODE) ?: DEFAULT_THEME_MODE)
                }
            }
            encryptedPrefs.registerOnSharedPreferenceChangeListener(listener)
            send(encryptedPrefs.getString(KEY_THEME_MODE, DEFAULT_THEME_MODE) ?: DEFAULT_THEME_MODE)
            awaitClose {
                encryptedPrefs.unregisterOnSharedPreferenceChangeListener(listener)
            }
        }
    }

    /**
     * 同步获取存储的主题模式
     * 
     * @return 主题模式字符串，如果不存在则返回默认值 SYSTEM
     */
    suspend fun getThemeModeSync(): String {
        return encryptedPrefs.getString(KEY_THEME_MODE, DEFAULT_THEME_MODE) ?: DEFAULT_THEME_MODE
    }

    /**
     * 清除存储的主题设置（恢复为默认跟随系统）
     */
    suspend fun clearThemeMode() {
        encryptedPrefs.edit().remove(KEY_THEME_MODE).apply()
    }

    companion object {
        private const val TAG = "ThemePreferencesStore"
        private const val PREFS_NAME = "claw_secure_prefs"
        private const val KEY_THEME_MODE = "theme_mode"
        private const val DEFAULT_THEME_MODE = "SYSTEM"
        
        @Volatile
        private var INSTANCE: ThemePreferencesStore? = null

        /**
         * 获取 ThemePreferencesStore 单例
         * 
         * @param context 应用上下文
         * @return ThemePreferencesStore 实例
         */
        fun getInstance(context: Context): ThemePreferencesStore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ThemePreferencesStore(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

package com.example.claw_code_application.data.local

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 主题偏好设置存储管理器（MMKV优化版）
 * 使用腾讯MMKV替代EncryptedSharedPreferences，读写性能提升10~100倍
 *
 * 微信架构思想：高频读取的配置使用高性能存储，避免启动时IO阻塞
 *
 * 支持的主题模式：
 * - LIGHT: 浅色模式
 * - DARK: 深色模式
 * - SYSTEM: 跟随系统（默认）
 */
class ThemePreferencesStore(private val context: Context) {

    /** 主题状态流，用于响应式UI更新 */
    private val _themeFlow = MutableStateFlow(DEFAULT_THEME_MODE)
    val themeFlow: Flow<String> = _themeFlow.asStateFlow()

    /** 气泡主题状态流 */
    private val _bubbleThemeFlow = MutableStateFlow(DEFAULT_BUBBLE_THEME)
    val bubbleThemeFlow: Flow<String> = _bubbleThemeFlow.asStateFlow()

    init {
        _themeFlow.value = getThemeModeSync()
        _bubbleThemeFlow.value = getBubbleThemeSync()
    }

    /**
     * 保存主题模式到MMKV存储
     * 同步写入，立即返回，性能极快
     *
     * @param themeMode 主题模式字符串（LIGHT, DARK, SYSTEM）
     */
    suspend fun saveThemeMode(themeMode: String) {
        // 使用MMKV默认实例存储非敏感配置
        val success = MMKVManager.putString(KEY_THEME_MODE, themeMode)

        // 同步到状态流
        _themeFlow.value = themeMode

        android.util.Log.d(TAG, "主题保存: $themeMode, 结果: $success")
    }

    /**
     * 获取存储的主题模式（Flow响应式版本）
     *
     * @return 主题模式 Flow，如果不存在则返回默认值 SYSTEM
     */
    fun getThemeMode(): Flow<String> {
        return themeFlow
    }

    /**
     * 同步获取存储的主题模式
     * 直接从MMKV读取，无阻塞，性能极快
     *
     * @return 主题模式字符串，如果不存在则返回默认值 SYSTEM
     */
    fun getThemeModeSync(): String {
        return MMKVManager.getString(KEY_THEME_MODE, DEFAULT_THEME_MODE) ?: DEFAULT_THEME_MODE
    }

    /**
     * 清除存储的主题设置（恢复为默认跟随系统）
     */
    suspend fun clearThemeMode() {
        MMKVManager.remove(KEY_THEME_MODE)
        _themeFlow.value = DEFAULT_THEME_MODE
    }

    /**
     * 保存气泡主题到MMKV存储
     *
     * @param bubbleTheme 气泡主题字符串（CLASSIC, OCEAN, MINT, LAVENDER, SUNSET, SAKURA）
     */
    suspend fun saveBubbleTheme(bubbleTheme: String) {
        val success = MMKVManager.putString(KEY_BUBBLE_THEME, bubbleTheme)
        _bubbleThemeFlow.value = bubbleTheme
        android.util.Log.d(TAG, "气泡主题保存: $bubbleTheme, 结果: $success")
    }

    /**
     * 同步获取存储的气泡主题
     *
     * @return 气泡主题字符串，如果不存在则返回默认值 OCEAN
     */
    fun getBubbleThemeSync(): String {
        return MMKVManager.getString(KEY_BUBBLE_THEME, DEFAULT_BUBBLE_THEME) ?: DEFAULT_BUBBLE_THEME
    }

    companion object {
        private const val KEY_THEME_MODE = "theme_mode"
        private const val DEFAULT_THEME_MODE = "SYSTEM"
        private const val KEY_BUBBLE_THEME = "bubble_theme"
        private const val DEFAULT_BUBBLE_THEME = "OCEAN"
        private const val TAG = "ThemePreferencesStore"

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

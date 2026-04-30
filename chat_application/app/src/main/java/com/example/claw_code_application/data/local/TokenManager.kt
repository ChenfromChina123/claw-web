package com.example.claw_code_application.data.local

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Token本地存储管理器（MMKV优化版）
 * 使用腾讯MMKV替代EncryptedSharedPreferences，读写性能提升10~100倍
 *
 * 微信架构思想：核心配置使用高性能存储，减少IO阻塞，提升启动速度
 *
 * 性能对比：
 * - SharedPreferences: 10-50ms/读写
 * - DataStore: 50-100ms/读写
 * - MMKV: 0.1-1ms/读写（mmap内存映射）
 */
class TokenManager(private val context: Context) {

    /** MMKV存储Key */
    private companion object {
        const val KEY_AUTH_TOKEN = "auth_token"
        const val TAG = "TokenManager"
    }

    /** Token状态流，用于响应式UI更新 */
    private val _tokenFlow = MutableStateFlow<String?>(null)
    val tokenFlow: Flow<String?> = _tokenFlow.asStateFlow()

    init {
        // 初始化时从MMKV读取token
        _tokenFlow.value = getTokenSync()
    }

    /**
     * 保存Token到MMKV加密存储
     * 同步写入，立即返回，性能极快
     *
     * @param token 认证Token
     */
    suspend fun saveToken(token: String) {
        android.util.Log.d(TAG, "=== saveToken ===")
        android.util.Log.d(TAG, "Token 长度: ${token.length}")
        android.util.Log.d(TAG, "Token 前80字符: ${token.take(80)}")
        android.util.Log.d(TAG, "Token 后20字符: ${token.takeLast(20)}")

        // 使用MMKV加密实例存储敏感数据
        val success = MMKVManager.putEncryptedString(KEY_AUTH_TOKEN, token)

        // 同步到状态流
        _tokenFlow.value = token

        android.util.Log.d(TAG, "MMKV保存结果: $success")

        // 验证保存（开发调试）
        val saved = MMKVManager.getEncryptedString(KEY_AUTH_TOKEN)
        android.util.Log.d(TAG, "验证保存: ${saved == token}")
        android.util.Log.d(TAG, "读取长度: ${saved?.length ?: 0}")
    }

    /**
     * 获取存储的Token（Flow响应式版本）
     * @return Token字符串Flow，如果不存在则返回null
     */
    fun getToken(): Flow<String?> {
        return tokenFlow
    }

    /**
     * 同步获取Token
     * 直接从MMKV读取，无阻塞，性能极快
     *
     * @return Token字符串，如果不存在则返回null
     */
    suspend fun getTokenSync(): String? {
        val token = MMKVManager.getEncryptedString(KEY_AUTH_TOKEN)
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
        MMKVManager.removeEncrypted(KEY_AUTH_TOKEN)
        _tokenFlow.value = null
        android.util.Log.d(TAG, "Token已清除")
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

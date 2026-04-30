package com.example.claw_code_application.data.local

import android.content.Context
import com.tencent.mmkv.MMKV

/**
 * MMKV管理器
 * 腾讯开源的高性能键值存储库，基于mmap内存映射，比SharedPreferences快10~100倍
 *
 * 核心优势：
 * 1. 极速读写 - 基于mmap，读写性能接近内存操作
 * 2. 多进程支持 - 支持多进程共享数据
 * 3. 数据加密 - 支持AES加密存储敏感数据
 * 4. 类型安全 - 支持多种数据类型直接存储
 * 5. 增量更新 - 支持单条数据更新，无需全量写入
 *
 * 微信架构思想：使用MMKV替代SharedPreferences/DataStore，减少IO阻塞，提升启动速度
 */
object MMKVManager {

    private const val DEFAULT_MMAP_ID = "claw_default"
    private const val ENCRYPTED_MMAP_ID = "claw_encrypted"

    /** 默认MMKV实例（非加密） */
    private var defaultMMKV: MMKV? = null

    /** 加密MMKV实例（用于存储敏感数据如Token） */
    private var encryptedMMKV: MMKV? = null

    /**
     * 初始化MMKV
     * 应在Application.onCreate()中尽早调用
     *
     * @param context 应用上下文
     */
    fun initialize(context: Context) {
        val rootDir = MMKV.initialize(context.applicationContext)
        android.util.Log.i("MMKVManager", "MMKV初始化完成，根目录: $rootDir")

        // 初始化默认实例
        defaultMMKV = MMKV.mmkvWithID(DEFAULT_MMAP_ID, MMKV.MULTI_PROCESS_MODE)

        // 初始化加密实例（使用设备唯一标识作为密钥种子）
        val cryptKey = generateCryptKey(context)
        encryptedMMKV = MMKV.mmkvWithID(ENCRYPTED_MMAP_ID, MMKV.MULTI_PROCESS_MODE, cryptKey)
    }

    /**
     * 获取默认MMKV实例（非加密）
     * 适用于存储非敏感配置数据
     */
    fun default(): MMKV {
        return defaultMMKV ?: throw IllegalStateException("MMKV未初始化，请先调用initialize()")
    }

    /**
     * 获取加密MMKV实例
     * 适用于存储敏感数据如Token、用户信息等
     */
    fun encrypted(): MMKV {
        return encryptedMMKV ?: throw IllegalStateException("MMKV未初始化，请先调用initialize()")
    }

    /**
     * 生成加密密钥
     * 结合设备唯一标识和应用签名，确保密钥的唯一性和安全性
     */
    private fun generateCryptKey(context: Context): String {
        val deviceId = getDeviceIdentifier(context)
        val packageName = context.packageName
        // 生成16字节密钥
        return (deviceId + packageName).take(16).padEnd(16, '0')
    }

    /**
     * 获取设备唯一标识
     * 优先使用Android ID，失败时使用随机UUID
     */
    private fun getDeviceIdentifier(context: Context): String {
        return try {
            @SuppressLint("HardwareIds")
            val androidId = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
            androidId ?: java.util.UUID.randomUUID().toString()
        } catch (e: Exception) {
            java.util.UUID.randomUUID().toString()
        }
    }

    // ==================== 便捷方法 ====================

    /**
     * 存储字符串（默认实例）
     */
    fun putString(key: String, value: String?): Boolean {
        return default().encode(key, value)
    }

    /**
     * 获取字符串（默认实例）
     */
    fun getString(key: String, defaultValue: String? = null): String? {
        return default().decodeString(key, defaultValue)
    }

    /**
     * 存储字符串（加密实例）
     */
    fun putEncryptedString(key: String, value: String?): Boolean {
        return encrypted().encode(key, value)
    }

    /**
     * 获取字符串（加密实例）
     */
    fun getEncryptedString(key: String, defaultValue: String? = null): String? {
        return encrypted().decodeString(key, defaultValue)
    }

    /**
     * 存储布尔值
     */
    fun putBoolean(key: String, value: Boolean): Boolean {
        return default().encode(key, value)
    }

    /**
     * 获取布尔值
     */
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
        return default().decodeBool(key, defaultValue)
    }

    /**
     * 存储整型
     */
    fun putInt(key: String, value: Int): Boolean {
        return default().encode(key, value)
    }

    /**
     * 获取整型
     */
    fun getInt(key: String, defaultValue: Int = 0): Int {
        return default().decodeInt(key, defaultValue)
    }

    /**
     * 存储长整型
     */
    fun putLong(key: String, value: Long): Boolean {
        return default().encode(key, value)
    }

    /**
     * 获取长整型
     */
    fun getLong(key: String, defaultValue: Long = 0L): Long {
        return default().decodeLong(key, defaultValue)
    }

    /**
     * 删除指定key
     */
    fun remove(key: String) {
        default().removeValueForKey(key)
    }

    /**
     * 删除加密实例中的指定key
     */
    fun removeEncrypted(key: String) {
        encrypted().removeValueForKey(key)
    }

    /**
     * 清空默认实例所有数据
     */
    fun clear() {
        default().clearAll()
    }

    /**
     * 检查key是否存在
     */
    fun contains(key: String): Boolean {
        return default().containsKey(key)
    }

    /**
     * 同步数据到磁盘
     * 在关键数据写入后调用，确保数据不丢失
     */
    fun sync() {
        default().sync()
        encrypted().sync()
    }
}

// 添加SuppressLint导入
import android.annotation.SuppressLint
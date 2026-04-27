package com.example.claw_code_application.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 网络配置管理类
 * 统一管理后端连接地址，支持自动检测和手动配置
 * 
 * 功能：
 * 1. 自动检测模拟器/真机环境
 * 2. 支持手动配置后端 IP 和端口
 * 3. 配置持久化存储
 * 4. WebSocket 地址自动推导
 */
object NetworkConfig {
    
    private const val TAG = "NetworkConfig"
    private const val PREFS_NAME = "network_config"
    private const val KEY_IP_ADDRESS = "ip_address"
    private const val KEY_PORT = "port"
    private const val KEY_USE_CUSTOM_IP = "use_custom_ip"
    
    /** 默认配置 */
    private const val DEFAULT_EMULATOR_IP = "10.0.2.2"
    private const val DEFAULT_REAL_DEVICE_IP = "192.168.45.123"
    private const val DEFAULT_PORT = 13000
    
    private lateinit var sharedPreferences: SharedPreferences
    private var cachedBaseUrl: String? = null
    private var cachedWebSocketUrl: String? = null
    
    /**
     * 初始化（必须在 Application.onCreate() 中调用）
     */
    fun init(context: Context) {
        sharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    /**
     * 获取当前 Base URL
     * 优先使用手动配置，否则自动检测
     */
    fun getBaseUrl(): String {
        cachedBaseUrl?.let { return it }
        
        val envType = NetworkEnvironment.detectEnvironment()
        val baseUrl = when (envType) {
            NetworkEnvironment.EnvironmentType.EMULATOR -> {
                "http://$DEFAULT_EMULATOR_IP:$DEFAULT_PORT"
            }
            NetworkEnvironment.EnvironmentType.REAL_DEVICE_LAN,
            NetworkEnvironment.EnvironmentType.REAL_DEVICE_WAN -> {
                val ip = getCustomIpAddress() ?: DEFAULT_REAL_DEVICE_IP
                val port = getPort()
                "http://$ip:$port"
            }
            NetworkEnvironment.EnvironmentType.UNKNOWN -> {
                "http://$DEFAULT_EMULATOR_IP:$DEFAULT_PORT"
            }
        }
        
        cachedBaseUrl = baseUrl
        Log.d(TAG, "Base URL: $baseUrl (环境: $envType)")
        return baseUrl
    }
    
    /**
     * 获取 WebSocket URL
     * 自动从 HTTP Base URL 推导
     */
    fun getWebSocketUrl(): String {
        cachedWebSocketUrl?.let { return it }
        
        val httpUrl = getBaseUrl()
        // 将 http:// 或 https:// 转换为 ws:// 或 wss://
        val wsProtocol = httpUrl.replace("http://", "ws://").replace("https://", "wss://")
        val wsUrl = "$wsProtocol/api/ws"
        
        cachedWebSocketUrl = wsUrl
        Log.d(TAG, "WebSocket URL: $wsUrl")
        return wsUrl
    }
    
    /**
     * 获取手动配置的 IP 地址
     */
    fun getCustomIpAddress(): String? {
        return if (isUsingCustomIp()) {
            sharedPreferences.getString(KEY_IP_ADDRESS, null)
        } else {
            null
        }
    }
    
    /**
     * 获取端口号
     */
    fun getPort(): Int {
        return sharedPreferences.getInt(KEY_PORT, DEFAULT_PORT)
    }
    
    /**
     * 是否使用手动配置的 IP
     */
    fun isUsingCustomIp(): Boolean {
        return sharedPreferences.getBoolean(KEY_USE_CUSTOM_IP, false)
    }
    
    /**
     * 设置自定义 IP 地址和端口
     */
    fun setCustomIpAddress(ip: String, port: Int = DEFAULT_PORT) {
        sharedPreferences.edit().apply {
            putString(KEY_IP_ADDRESS, ip)
            putInt(KEY_PORT, port)
            putBoolean(KEY_USE_CUSTOM_IP, true)
            apply()
        }
        // 清除缓存
        cachedBaseUrl = null
        cachedWebSocketUrl = null
        Log.d(TAG, "已设置自定义 IP: $ip:$port")
    }
    
    /**
     * 清除自定义 IP，恢复自动检测
     */
    fun clearCustomIpAddress() {
        sharedPreferences.edit().apply {
            remove(KEY_IP_ADDRESS)
            remove(KEY_USE_CUSTOM_IP)
            apply()
        }
        cachedBaseUrl = null
        cachedWebSocketUrl = null
        Log.d(TAG, "已清除自定义 IP，恢复自动检测")
    }
    
    /**
     * 异步探测并设置最佳后端地址
     * 会尝试多个地址，自动选择第一个可用的
     */
    suspend fun autoDetectAndSet(context: Context): String? {
        return withContext(Dispatchers.IO) {
            val discovered = NetworkEnvironment.discoverBackend()
            discovered?.let { url ->
                // 从 URL 中提取 IP 和端口
                val ipPort = url.removePrefix("http://").removePrefix("https://")
                val parts = ipPort.split(":")
                if (parts.size == 2) {
                    setCustomIpAddress(parts[0], parts[1].toIntOrNull() ?: DEFAULT_PORT)
                    Log.d(TAG, "自动设置后端地址: $url")
                }
            }
            discovered
        }
    }
    
    /**
     * 获取配置摘要信息（用于调试显示）
     */
    fun getConfigSummary(context: Context): String {
        val envType = NetworkEnvironment.detectEnvironment()
        val envDesc = NetworkEnvironment.getEnvironmentDescription(context, envType)
        val baseUrl = getBaseUrl()
        val wsUrl = getWebSocketUrl()
        val customIp = getCustomIpAddress()
        
        return buildString {
            appendLine("环境类型: $envType")
            appendLine(envDesc)
            appendLine("Base URL: $baseUrl")
            appendLine("WebSocket URL: $wsUrl")
            if (customIp != null) {
                appendLine("自定义 IP: $customIp:${getPort()}")
            } else {
                appendLine("自动检测模式")
            }
        }
    }
}

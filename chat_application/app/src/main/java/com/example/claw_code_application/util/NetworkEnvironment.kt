package com.example.claw_code_application.util

import android.content.Context
import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * 网络环境检测器
 * 自动检测当前运行环境并选择合适的后端 Base URL
 * 
 * 支持的环境：
 * 1. Android 模拟器（10.0.2.2）
 * 2. 真机 - 同一局域网（通过自动发现或手动配置）
 * 3. 真机 - 通过外网地址访问
 */
object NetworkEnvironment {
    
    private const val TAG = "NetworkEnvironment"
    
    /**
     * 环境类型枚举
     */
    enum class EnvironmentType {
        /** Android 模拟器 */
        EMULATOR,
        /** 真机 - 同一局域网 */
        REAL_DEVICE_LAN,
        /** 真机 - 外网 */
        REAL_DEVICE_WAN,
        /** 未知环境 */
        UNKNOWN
    }
    
    /** 默认端口（Docker 对外暴露的端口） */
    private const val DEFAULT_PORT = 13000
    
    /**
     * 可能的后端地址列表（按优先级排序）
     */
    private val POSSIBLE_URLS = listOf(
        // 模拟器专用（localhost 映射）
        "http://10.0.2.2:$DEFAULT_PORT",
        // 常见局域网地址段
        "http://192.168.1.100:$DEFAULT_PORT",
        "http://192.168.0.100:$DEFAULT_PORT",
        "http://192.168.45.123:$DEFAULT_PORT",
        "http://192.168.31.100:$DEFAULT_PORT",
        // 备用地址
        "http://localhost:$DEFAULT_PORT",
        "http://127.0.0.1:$DEFAULT_PORT"
    )
    
    /**
     * 检测当前运行环境
     */
    fun detectEnvironment(): EnvironmentType {
        // 通过 Build 特征判断是否为模拟器
        val isEmulator = Build.FINGERPRINT.startsWith("generic") ||
                Build.FINGERPRINT.lowercase().contains("vbox") ||
                Build.FINGERPRINT.lowercase().contains("test-keys") ||
                Build.MODEL.contains("google_sdk") ||
                Build.MODEL.contains("Emulator") ||
                Build.MODEL.contains("Android SDK") ||
                Build.MODEL.lowercase().contains("droid4x") ||
                Build.MODEL.lowercase().contains("nightmare") ||
                Build.HARDWARE.contains("goldfish") ||
                Build.HARDWARE.contains("ranchu") ||
                Build.HARDWARE.contains("vbox86") ||
                Build.PRODUCT.contains("sdk") ||
                Build.PRODUCT.contains("google_sdk") ||
                Build.PRODUCT.contains("sdk_google") ||
                Build.PRODUCT.contains("sdk_x86") ||
                Build.PRODUCT.contains("vbox86p") ||
                Build.PRODUCT.contains("emulator") ||
                Build.PRODUCT.contains("simulator") ||
                Build.BOARD.lowercase().contains("nox") ||
                Build.BOOTLOADER.lowercase().contains("nox") ||
                (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")) ||
                "google_sdk" == Build.PRODUCT
        
        return if (isEmulator) {
            EnvironmentType.EMULATOR
        } else {
            EnvironmentType.REAL_DEVICE_LAN
        }
    }
    
    /**
     * 获取推荐的 Base URL
     */
    fun getRecommendedBaseUrl(environmentType: EnvironmentType): String {
        return when (environmentType) {
            EnvironmentType.EMULATOR -> "http://10.0.2.2:$DEFAULT_PORT"
            EnvironmentType.REAL_DEVICE_LAN -> "http://192.168.45.123:$DEFAULT_PORT"
            EnvironmentType.REAL_DEVICE_WAN -> "https://your-domain.com"
            EnvironmentType.UNKNOWN -> "http://10.0.2.2:$DEFAULT_PORT"
        }
    }
    
    /**
     * 自动探测可用的后端地址
     * 会尝试多个地址，返回第一个可用的
     */
    suspend fun discoverBackend(timeoutMs: Long = 2000): String? {
        return withContext(Dispatchers.IO) {
            for (url in POSSIBLE_URLS) {
                if (isBackendAvailable(url, timeoutMs)) {
                    Log.d(TAG, "发现可用后端地址: $url")
                    return@withContext url
                }
            }
            Log.w(TAG, "未发现可用的后端地址")
            null
        }
    }
    
    /**
     * 检查后端地址是否可用
     */
    private fun isBackendAvailable(baseUrl: String, timeoutMs: Long): Boolean {
        return try {
            val healthUrl = "$baseUrl/api/health"
            val connection = URL(healthUrl).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = timeoutMs.toInt()
            connection.readTimeout = timeoutMs.toInt()
            connection.connect()
            val responseCode = connection.responseCode
            connection.disconnect()
            // 200 或 404（接口不存在但服务器在线）都算可用
            responseCode in 200..499
        } catch (e: Exception) {
            Log.d(TAG, "地址 $baseUrl 不可用: ${e.message}")
            false
        }
    }
    
    /**
     * 获取友好的环境说明文本
     */
    fun getEnvironmentDescription(context: Context, environmentType: EnvironmentType): String {
        return when (environmentType) {
            EnvironmentType.EMULATOR -> "检测到模拟器环境，将使用 10.0.2.2 连接本机后端"
            EnvironmentType.REAL_DEVICE_LAN -> "检测到真机环境，请确保与电脑在同一网络，并配置正确的 IP 地址"
            EnvironmentType.REAL_DEVICE_WAN -> "检测到外网环境，将使用远程服务器地址"
            EnvironmentType.UNKNOWN -> "无法确定网络环境，使用默认配置"
        }
    }
}

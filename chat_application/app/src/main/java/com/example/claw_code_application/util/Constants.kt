package com.example.claw_code_application.util

/**
 * 应用常量定义
 */
object Constants {
    /**
     * 后端服务基础URL
     *
     * 根据您的网络环境选择以下配置之一：
     *
     * 1. Android 模拟器（推荐）:
     *    const val BASE_URL = "http://10.0.2.2:13000"
     *
     * 2. 真机 - 同一WiFi网络（查看电脑WiFi IP）:
     *    const val BASE_URL = "http://192.168.x.x:13000"
     *
     * 3. 真机 - 手机热点（查看电脑获取的IP）:
     *    const val BASE_URL = "http://192.168.43.x:13000"
     *
     * 4. 生产环境:
     *    const val BASE_URL = "https://your-domain.com"
     *
     * 如何查看电脑IP：
     * - Windows: 运行 cmd，输入 ipconfig，查看 WLAN 的 IPv4 地址
     * - Mac/Linux: 运行 ifconfig 或 ip addr，查看 WiFi 接口的 IP
     *
     * 注意：确保手机和电脑在同一网络下！
     */
    const val BASE_URL = "http://192.168.45.123:13000"

    /** API超时时间（秒） */
    const val CONNECT_TIMEOUT = 30L
    const val READ_TIMEOUT = 60L
    const val WRITE_TIMEOUT = 60L

    /** DataStore名称 */
    const val PREFS_NAME = "auth_prefs"

    /** Token存储键名 */
    const val KEY_AUTH_TOKEN = "auth_token"

    /** 默认AI模型 */
    const val DEFAULT_MODEL = "qwen-plus"

    /** 默认Agent ID */
    const val DEFAULT_AGENT_ID = "default"

    /** 消息列表每页加载数量 */
    const val PAGE_SIZE = 50
}

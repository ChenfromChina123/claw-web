package com.example.claw_code_application.util

/**
 * 应用常量定义
 */
object Constants {
    /**
     * 后端服务默认端口
     */
    const val DEFAULT_SERVER_PORT = 3000

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
    
    /**
     * 网络配置说明
     * 
     * Android 模拟器：自动使用 10.0.2.2 连接电脑本机
     * 真机 - 同一WiFi：需要手动配置电脑局域网 IP（如 192.168.1.100）
     * 真机 - 手机热点：需要配置电脑在手机热点中的 IP（如 192.168.43.1）
     * 
     * 查看电脑 IP：
     * - Windows: cmd 中运行 ipconfig，查看 WLAN 的 IPv4 地址
     * - Mac: 系统偏好设置 > 网络 > 查看 IP 地址
     * 
     * 注意：真机使用时需要确保：
     * 1. 手机和电脑在同一网络
     * 2. 电脑防火墙允许 3000 端口入站连接
     * 3. 后端服务正在运行（bun run dev）
     */
    const val NETWORK_HELP_TEXT = "请在设置中配置后端 IP 地址"
}

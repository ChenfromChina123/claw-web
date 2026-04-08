package com.aispring.common;

/**
 * URL 处理相关常量
 * 统一管理 URL 内容抓取服务的配置参数
 */
public final class UrlConstants {

    private UrlConstants() {
    }

    /**
     * 默认最大字符数
     */
    public static final int DEFAULT_MAX_CHARS = 5000;

    /**
     * 请求超时时间（毫秒）
     */
    public static final int TIMEOUT_MS = 15000;

    /**
     * HTTP 请求 User-Agent
     */
    public static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
}

package com.aispring.common;

/**
 * 限流相关常量
 * 统一管理所有限流配置参数
 */
public final class RateLimitConstants {

    private RateLimitConstants() {
    }

    /**
     * 聊天限流键前缀
     */
    public static final String CHAT_LIMIT_PREFIX = "chat_limit:";

    /**
     * 聊天最大请求次数
     */
    public static final int CHAT_MAX_REQUESTS = 5;

    /**
     * 聊天限流过期时间（小时）
     */
    public static final long CHAT_EXPIRATION_HOURS = 24;

    /**
     * Playground 限流键前缀
     */
    public static final String PLAYGROUND_LIMIT_PREFIX = "playground_limit:";
}

package com.aispring.common;

/**
 * Redis 缓存相关常量
 * 统一管理所有 Redis 缓存键前缀和过期时间配置
 */
public final class CacheConstants {

    private CacheConstants() {
    }

    /**
     * 聊天消息缓存前缀
     */
    public static final String MESSAGES_CACHE_PREFIX = "chat:messages:";

    /**
     * 会话缓存前缀
     */
    public static final String SESSION_CACHE_PREFIX = "chat:session:";

    /**
     * URL 过滤规则缓存键
     */
    public static final String RULES_CACHE = "urlFilterRules";

    /**
     * 公共词汇缓存前缀
     */
    public static final String PUBLIC_WORD_CACHE_PREFIX = "public_word:";

    /**
     * 公共词汇搜索缓存前缀
     */
    public static final String PUBLIC_WORDS_SEARCH_CACHE_PREFIX = "public_words_search:";

    /**
     * 缓存过期时间（小时）
     */
    public static final long CACHE_DURATION_HOURS = 24;
}

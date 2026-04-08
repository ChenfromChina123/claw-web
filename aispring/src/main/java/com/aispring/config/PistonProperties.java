package com.aispring.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Piston 代码执行引擎配置
 */
@Configuration
@ConfigurationProperties(prefix = "piston")
@Data
public class PistonProperties {

    /**
     * Piston API 地址
     */
    private String apiUrl = "http://localhost:2000";

    /**
     * 执行超时时间 (毫秒)
     */
    private int executeTimeout = 10000;

    /**
     * 代码最大长度 (字节)
     */
    private int maxCodeLength = 65536;

    /**
     * stdin 最大长度 (字节)
     */
    private int maxStdinLength = 8192;

    /**
     * 速率限制配置
     */
    private RateLimit rateLimit = new RateLimit();

    @Data
    public static class RateLimit {
        /**
         * 每用户每窗口最大请求数
         */
        private int maxRequests = 30;

        /**
         * 限流窗口 (小时)
         */
        private int windowHours = 1;
    }
}

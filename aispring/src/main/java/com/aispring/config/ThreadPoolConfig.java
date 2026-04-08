package com.aispring.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * 线程池配置类
 * 统一管理应用中的线程池，避免资源浪费和潜在的 OOM 风险
 */
@Configuration
public class ThreadPoolConfig {

    /**
     * SSH/WebSocket 连接线程池
     * 用于处理 SSH 连接和 WebSocket 消息
     */
    @Bean("sshExecutor")
    public ExecutorService sshExecutor() {
        return new ThreadPoolExecutor(
            5,
            50,
            60L,
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }

    /**
     * 聊天处理线程池
     * 用于处理 AI 聊天请求
     */
    @Bean("chatExecutor")
    public ExecutorService chatExecutor() {
        return new ThreadPoolExecutor(
            8,
            16,
            60L,
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }

    /**
     * 后台任务线程池
     * 用于处理后台任务（如标题生成、建议生成等）
     */
    @Bean("backgroundExecutor")
    public ExecutorService backgroundExecutor() {
        return new ThreadPoolExecutor(
            2,
            4,
            60L,
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(50),
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }
}

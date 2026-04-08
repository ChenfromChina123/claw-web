package com.aispring.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket 配置类
 * 同时支持原生 WebSocket 和 STOMP 协议
 */
@Configuration
@EnableWebSocket
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketConfigurer, WebSocketMessageBrokerConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebSocketConfig.class);

    private final SSHWebSocketHandler sshWebSocketHandler;

    public WebSocketConfig(SSHWebSocketHandler sshWebSocketHandler) {
        this.sshWebSocketHandler = sshWebSocketHandler;
    }

    /**
     * 注册原生 WebSocket 处理器（用于终端）
     */
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        log.info("正在注册 WebSocket 处理器到路径：/ws/terminal/{serverId} 和 /api/ws/terminal/{serverId}");
        registry.addHandler(sshWebSocketHandler, "/ws/terminal/{serverId}", "/api/ws/terminal/{serverId}")
                .setAllowedOrigins("*");
        log.info("WebSocket 处理器注册成功");
    }

    /**
     * 配置 STOMP 消息代理（用于 SFTP 进度推送）
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/queue", "/topic");
        config.setUserDestinationPrefix("/user");
    }

    /**
     * 注册 STOMP 端点
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/stomp")
                .setAllowedOriginPatterns("*")
                .withSockJS();
        log.info("STOMP WebSocket 端点注册成功：/ws/stomp");
    }
}

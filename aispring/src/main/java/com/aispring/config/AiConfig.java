package com.aispring.config;

import org.springframework.context.annotation.Configuration;

/**
 * Spring AI配置类，确保ChatClient和StreamingChatClient正确初始化
 * 实际上，Spring Boot会自动配置这些Bean，我们只需要确保application.yml中的配置正确即可
 */
@Configuration
public class AiConfig {
    // 移除所有手动配置，让Spring Boot自动配置
    // Spring AI会自动读取application.yml中的spring.ai.openai配置
    // 并创建ChatClient和StreamingChatClient实例
}

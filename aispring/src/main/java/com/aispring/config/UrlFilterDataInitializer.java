package com.aispring.config;

import com.aispring.entity.UrlFilterRule;
import com.aispring.repository.UrlFilterRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * URL过滤规则数据初始化配置
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class UrlFilterDataInitializer {

    private final UrlFilterRuleRepository ruleRepository;

    /**
     * 初始化默认URL过滤规则
     * @return CommandLineRunner
     */
    @Bean
    public CommandLineRunner initUrlFilterRules() {
        return args -> {
            if (ruleRepository.count() == 0) {
                log.info("Initializing default URL filter rules...");
                
                createDefaultRules();
                
                log.info("Default URL filter rules initialized successfully.");
            }
        };
    }

    /**
     * 创建默认过滤规则
     */
    private void createDefaultRules() {
        createRule("阻止广告域名", "阻止常见广告域名", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.DOMAIN, 
                "*.ad.com", 10, "广告");
        
        createRule("阻止追踪器", "阻止常见追踪器域名", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.DOMAIN, 
                "*.tracker.com", 15, "隐私");
        
        createRule("阻止恶意软件", "阻止已知恶意软件网站", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.KEYWORD, 
                "malware", 5, "安全");
        
        createRule("阻止钓鱼网站", "阻止钓鱼相关关键词", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.KEYWORD, 
                "phishing", 5, "安全");
        
        createRule("阻止赌博网站", "阻止赌博相关网站", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.KEYWORD, 
                "casino", 20, "成人内容");
        
        createRule("阻止成人内容", "阻止成人内容关键词", 
                UrlFilterRule.FilterType.BLOCK, UrlFilterRule.MatchType.KEYWORD, 
                "adult", 25, "成人内容");
        
        createRule("允许教育网站", "允许教育类网站", 
                UrlFilterRule.FilterType.ALLOW, UrlFilterRule.MatchType.DOMAIN, 
                "*.edu.cn", 1, "教育");
        
        createRule("允许政府网站", "允许政府类网站", 
                UrlFilterRule.FilterType.ALLOW, UrlFilterRule.MatchType.DOMAIN, 
                "*.gov.cn", 1, "政府");
    }

    /**
     * 创建单个规则
     */
    private void createRule(String name, String description, 
                           UrlFilterRule.FilterType filterType, 
                           UrlFilterRule.MatchType matchType,
                           String pattern, int priority, String category) {
        UrlFilterRule rule = UrlFilterRule.builder()
                .name(name)
                .description(description)
                .filterType(filterType)
                .matchType(matchType)
                .pattern(pattern)
                .priority(priority)
                .enabled(true)
                .category(category)
                .build();
        ruleRepository.save(rule);
    }
}

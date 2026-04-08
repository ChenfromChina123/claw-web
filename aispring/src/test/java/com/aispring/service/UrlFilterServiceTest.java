package com.aispring.service;

import com.aispring.entity.UrlFilterRule;
import com.aispring.repository.UrlFilterRuleRepository;
import com.aispring.service.impl.UrlFilterServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * URL过滤服务测试类
 */
@ExtendWith(MockitoExtension.class)
class UrlFilterServiceTest {

    @Mock
    private UrlFilterRuleRepository ruleRepository;

    @InjectMocks
    private UrlFilterServiceImpl urlFilterService;

    private List<UrlFilterRule> testRules;

    @BeforeEach
    void setUp() {
        testRules = Arrays.asList(
            createRule(4L, "允许教育网站", UrlFilterRule.FilterType.ALLOW,
                      UrlFilterRule.MatchType.DOMAIN, "*.edu.cn", 1),
            createRule(2L, "阻止恶意软件", UrlFilterRule.FilterType.BLOCK,
                      UrlFilterRule.MatchType.KEYWORD, "malware", 5),
            createRule(1L, "阻止广告域名", UrlFilterRule.FilterType.BLOCK,
                      UrlFilterRule.MatchType.DOMAIN, "*.ad.com", 10),
            createRule(3L, "阻止赌博网站", UrlFilterRule.FilterType.BLOCK,
                      UrlFilterRule.MatchType.KEYWORD, "casino", 20),
            createRule(5L, "正则测试", UrlFilterRule.FilterType.BLOCK,
                      UrlFilterRule.MatchType.REGEX, ".*spam.*", 30)
        );
    }

    /**
     * 创建测试规则
     */
    private UrlFilterRule createRule(Long id, String name, UrlFilterRule.FilterType filterType,
                                     UrlFilterRule.MatchType matchType, String pattern, int priority) {
        return UrlFilterRule.builder()
                .id(id)
                .name(name)
                .filterType(filterType)
                .matchType(matchType)
                .pattern(pattern)
                .priority(priority)
                .enabled(true)
                .build();
    }

    @Test
    @DisplayName("测试域名匹配 - 阻止广告域名")
    void testDomainMatch_BlockAdDomain() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://ads.ad.com/page");

        assertTrue(result.shouldFilter());
        assertEquals(UrlFilterRule.FilterType.BLOCK, result.filterType());
        assertEquals("阻止广告域名", result.matchedRule());
    }

    @Test
    @DisplayName("测试域名匹配 - 子域名匹配")
    void testDomainMatch_SubdomainMatch() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://sub.ad.com/page");

        assertTrue(result.shouldFilter());
        assertEquals(UrlFilterRule.FilterType.BLOCK, result.filterType());
    }

    @Test
    @DisplayName("测试关键词匹配 - 恶意软件")
    void testKeywordMatch_Malware() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://example.com/malware-download");

        assertTrue(result.shouldFilter());
        assertEquals(UrlFilterRule.FilterType.BLOCK, result.filterType());
        assertEquals("阻止恶意软件", result.matchedRule());
    }

    @Test
    @DisplayName("测试关键词匹配 - 赌博")
    void testKeywordMatch_Casino() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://example.com/casino-game");

        assertTrue(result.shouldFilter());
        assertEquals(UrlFilterRule.FilterType.BLOCK, result.filterType());
    }

    @Test
    @DisplayName("测试正则表达式匹配")
    void testRegexMatch() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://example.com/spam/content");

        assertTrue(result.shouldFilter());
        assertEquals(UrlFilterRule.FilterType.BLOCK, result.filterType());
        assertEquals("正则测试", result.matchedRule());
    }

    @Test
    @DisplayName("测试正常URL不被过滤")
    void testNormalUrl_NotFiltered() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://www.google.com/search");

        assertFalse(result.shouldFilter());
    }

    @Test
    @DisplayName("测试批量URL过滤")
    void testFilterUrls() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        List<String> urls = Arrays.asList(
            "https://www.google.com/search",
            "https://ads.ad.com/page",
            "https://example.com/malware-test",
            "https://www.baidu.com",
            "https://casino.example.com"
        );

        UrlFilterService.FilteredUrls result = urlFilterService.filterUrls(urls);

        assertEquals(2, result.allowedUrls().size());
        assertEquals(3, result.blockedUrls().size());
    }

    @Test
    @DisplayName("测试空URL列表")
    void testEmptyUrlList() {
        UrlFilterService.FilteredUrls result = urlFilterService.filterUrls(Collections.emptyList());

        assertEquals(0, result.allowedUrls().size());
        assertEquals(0, result.blockedUrls().size());
    }

    @Test
    @DisplayName("测试空规则列表")
    void testEmptyRuleList() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(Collections.emptyList());

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://ads.ad.com/page");

        assertFalse(result.shouldFilter());
    }

    @Test
    @DisplayName("测试无效URL格式")
    void testInvalidUrlFormat() {
        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(testRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("invalid-url");

        assertFalse(result.shouldFilter());
    }

    @Test
    @DisplayName("测试null URL")
    void testNullUrl() {
        UrlFilterService.FilterResult result = urlFilterService.checkUrl(null);

        assertFalse(result.shouldFilter());
    }

    @Test
    @DisplayName("测试优先级 - 高优先级规则先匹配")
    void testPriority_HighPriorityFirst() {
        List<UrlFilterRule> priorityRules = Arrays.asList(
            createRule(2L, "高优先级", UrlFilterRule.FilterType.ALLOW,
                      UrlFilterRule.MatchType.KEYWORD, "test", 1),
            createRule(1L, "低优先级", UrlFilterRule.FilterType.BLOCK,
                      UrlFilterRule.MatchType.KEYWORD, "test", 100)
        );

        when(ruleRepository.findAllEnabledOrderByPriority()).thenReturn(priorityRules);

        UrlFilterService.FilterResult result = urlFilterService.checkUrl("https://example.com/test");

        assertTrue(result.shouldFilter());
        assertEquals("高优先级", result.matchedRule());
    }
}

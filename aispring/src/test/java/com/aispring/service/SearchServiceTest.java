package com.aispring.service;

import com.aispring.AiTutorApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = AiTutorApplication.class)
public class SearchServiceTest {

    @Autowired
    private SearchService searchService;

    @Test
    public void testSearchIndustryInfo() {
        String keyword = "Spring Boot 最新版本";
        System.out.println("开始测试普通搜索功能，搜索关键词: " + keyword);
        
        String result = searchService.searchIndustryInfo(keyword);
        
        System.out.println("搜索结果如下:\n" + result);
        
        assertNotNull(result, "搜索结果不应为空");
        assertFalse(result.contains("没有找到相关结果"), "搜索结果应该包含有效内容");
        assertTrue(result.contains("针对关键词\"" + keyword + "\"的实时搜索结果："), "结果格式不正确");
        
        // 至少应该能找到一条结果（包含 "1. "）
        assertTrue(result.contains("1. "), "应该至少包含一条搜索结果");
    }

    @Test
    public void testSearchWithSite() {
        String keyword = "Spring Boot";
        String site = "spring.io";
        System.out.println("\n开始测试指定网站搜索，搜索关键词: " + keyword + "，指定网站: " + site);
        
        String result = searchService.searchIndustryInfo(keyword, site);
        
        System.out.println("搜索结果如下:\n" + result);
        
        assertNotNull(result, "搜索结果不应为空");
        assertFalse(result.contains("没有找到相关结果"), "搜索结果应该包含有效内容");
        
        // 验证返回结果的标题中是否包含查询关键词（由于代码中并没有把site拼接到标题输出里，所以只验证关键词）
        assertTrue(result.contains("针对关键词\"" + keyword + "\"的实时搜索结果："), "结果格式不正确");
        
        // 至少应该能找到一条结果
        assertTrue(result.contains("1. "), "应该至少包含一条搜索结果");
        
        // 由于指定了 site:spring.io，结果中的链接很大可能包含 spring.io
        assertTrue(result.toLowerCase().contains("spring.io"), "搜索结果的链接应该包含指定的域名");
    }

    @Test
    public void testSearchDeepSeek() {
        String keyword = "API";
        String site = "deepseek.com";
        System.out.println("\n开始测试 DeepSeek 官方网站搜索，搜索关键词: " + keyword + "，指定网站: " + site);
        
        String result = searchService.searchIndustryInfo(keyword, site);
        
        System.out.println("搜索结果如下:\n" + result);
        
        assertNotNull(result, "搜索结果不应为空");
        
        // 允许没有找到结果的情况（如果DuckDuckGo对该特定组合没抓取到的话），但如果有结果，验证格式
        if (!result.contains("没有找到相关结果")) {
            assertTrue(result.contains("针对关键词\"" + keyword + "\"的实时搜索结果："), "结果格式不正确");
            assertTrue(result.toLowerCase().contains("deepseek.com"), "搜索结果的链接应该包含指定的域名");
        } else {
            System.out.println("提示：DuckDuckGo 在此特定组合下未返回结果，这属于搜索引擎的正常行为。");
        }
    }
}

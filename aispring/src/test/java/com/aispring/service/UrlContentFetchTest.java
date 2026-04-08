package com.aispring.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import static org.junit.jupiter.api.Assertions.*;

/**
 * URL内容获取测试类
 * 用于测试获取实际网页内容
 */
class UrlContentFetchTest {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    private static final int TIMEOUT_MS = 15000;

    @Test
    @DisplayName("测试获取DeepSeek官网内容")
    @EnabledIfSystemProperty(named = "test.network", matches = "true")
    void testFetchDeepSeekContent() throws Exception {
        String url = "https://www.deepseek.com";

        System.out.println("\n========================================");
        System.out.println("正在获取URL内容: " + url);
        System.out.println("========================================\n");

        Document doc = Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .timeout(TIMEOUT_MS)
                .followRedirects(true)
                .ignoreHttpErrors(true)
                .ignoreContentType(true)
                .get();

        String title = doc.title();
        String bodyText = Jsoup.clean(doc.body().text(), Safelist.none());
        bodyText = bodyText.replaceAll("\\s+", " ").trim();

        // 限制输出长度
        int maxChars = 2000;
        if (bodyText.length() > maxChars) {
            bodyText = bodyText.substring(0, maxChars) + "...";
        }

        System.out.println("【网页标题】" + (title.isEmpty() ? "无标题" : title));
        System.out.println("【来源URL】" + url);
        System.out.println("【内容长度】" + bodyText.length() + " 字符");
        System.out.println("\n【内容摘要】\n" + bodyText);
        System.out.println("\n========================================\n");

        assertNotNull(title);
        assertFalse(bodyText.isEmpty());
    }

    @Test
    @DisplayName("测试获取百度首页内容")
    @EnabledIfSystemProperty(named = "test.network", matches = "true")
    void testFetchBaiduContent() throws Exception {
        String url = "https://www.baidu.com";

        System.out.println("\n========================================");
        System.out.println("正在获取URL内容: " + url);
        System.out.println("========================================\n");

        Document doc = Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .timeout(TIMEOUT_MS)
                .followRedirects(true)
                .ignoreHttpErrors(true)
                .ignoreContentType(true)
                .get();

        String title = doc.title();
        String bodyText = Jsoup.clean(doc.body().text(), Safelist.none());
        bodyText = bodyText.replaceAll("\\s+", " ").trim();

        int maxChars = 1000;
        if (bodyText.length() > maxChars) {
            bodyText = bodyText.substring(0, maxChars) + "...";
        }

        System.out.println("【网页标题】" + (title.isEmpty() ? "无标题" : title));
        System.out.println("【来源URL】" + url);
        System.out.println("【内容长度】" + bodyText.length() + " 字符");
        System.out.println("\n【内容摘要】\n" + bodyText);
        System.out.println("\n========================================\n");

        assertNotNull(title);
    }
}

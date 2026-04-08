package com.aispring.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * URL获取正则表达式测试类
 */
class UrlFetchPatternTest {

    private static final Pattern URL_AUTO_PATTERN = Pattern.compile(
            "(?:正在获取|获取|fetch).*?(?:网页|页面|内容|url).*?(https?://[^\\s<>\"]+)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    @Test
    @DisplayName("测试自然语言格式 - 正在获取网页内容")
    void testNaturalLanguageFormat() {
        String content = "正在获取网页内容: http://bjtime.cn/";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        assertTrue(matcher.find());
        assertEquals("http://bjtime.cn/", matcher.group(1));
    }

    @Test
    @DisplayName("测试自然语言格式 - 获取页面")
    void testFetchPage() {
        String content = "正在获取页面: https://www.example.com/path";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        assertTrue(matcher.find());
        assertEquals("https://www.example.com/path", matcher.group(1));
    }

    @Test
    @DisplayName("测试自然语言格式 - 获取URL")
    void testFetchUrl() {
        String content = "正在获取URL内容: http://test.com/page.html";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        assertTrue(matcher.find());
        assertEquals("http://test.com/page.html", matcher.group(1));
    }

    @Test
    @DisplayName("测试不匹配的情况")
    void testNoMatch() {
        String content = "这是一个普通的回复，没有URL获取意图";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        assertFalse(matcher.find());
    }

    @Test
    @DisplayName("测试截图中的实际内容")
    void testScreenshotContent() {
        String content = "正在获取网页内容: http://bjtime.cn/\n\n北京时间";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        assertTrue(matcher.find());
        assertEquals("http://bjtime.cn/", matcher.group(1));
    }
}

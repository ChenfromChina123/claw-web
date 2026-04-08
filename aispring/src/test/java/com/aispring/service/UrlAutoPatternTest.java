package com.aispring.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * URL自动匹配正则表达式测试
 */
class UrlAutoPatternTest {

    private static final Pattern URL_AUTO_PATTERN = Pattern.compile(
            "(?:正在获取|获取|fetch).*?(?:网页|页面|内容|url).*?(https?://[^\\s<>\"]+)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    @Test
    @DisplayName("测试截图中的实际内容 - time.ac.cn")
    void testScreenshotTimeAcCn() {
        String content = "正在获取网页内容: http://www.time.ac.cn/...";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        System.out.println("测试内容: " + content);
        System.out.println("是否匹配: " + matcher.find());

        if (matcher.find()) {
            System.out.println("匹配到的URL: " + matcher.group(1));
        } else {
            System.out.println("未匹配到URL");
        }

        // 这个测试会失败，让我们看看为什么
        assertTrue(matcher.find(), "应该匹配到URL");
    }

    @Test
    @DisplayName("测试简化版本")
    void testSimplified() {
        String content = "正在获取网页内容: http://www.time.ac.cn/";
        Matcher matcher = URL_AUTO_PATTERN.matcher(content);

        System.out.println("测试内容: " + content);
        boolean found = matcher.find();
        System.out.println("是否匹配: " + found);

        if (found) {
            System.out.println("匹配到的URL: " + matcher.group(1));
        }

        assertTrue(found);
    }

    @Test
    @DisplayName("测试不同格式")
    void testDifferentFormats() {
        String[] testCases = {
            "正在获取网页内容: http://example.com",
            "正在获取页面: https://test.com",
            "获取内容: http://site.com",
            "fetch url: https://api.com",
            "正在获取网页内容: http://www.time.ac.cn/..."
        };

        for (String content : testCases) {
            Matcher matcher = URL_AUTO_PATTERN.matcher(content);
            boolean found = matcher.find();
            System.out.println("内容: " + content);
            System.out.println("匹配: " + found);
            if (found) {
                System.out.println("URL: " + matcher.group(1));
            }
            System.out.println("---");
        }
    }
}

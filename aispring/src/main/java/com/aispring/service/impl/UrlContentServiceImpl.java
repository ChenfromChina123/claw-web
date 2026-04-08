package com.aispring.service.impl;

import com.aispring.common.UrlConstants;
import com.aispring.entity.UrlFilterRule;
import com.aispring.service.UrlContentService;
import com.aispring.service.UrlFilterService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;

/**
 * URL内容获取服务实现类
 * 集成URL过滤功能，自动过滤不良URL
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class UrlContentServiceImpl implements UrlContentService {

    private final UrlFilterService urlFilterService;

    /**
     * 获取URL的网页内容
     * @param url 目标URL
     * @return 网页内容摘要
     */
    @Override
    public String fetchUrlContent(String url) {
        return fetchUrlContent(url, UrlConstants.DEFAULT_MAX_CHARS);
    }

    /**
     * 获取URL的网页内容（带字数限制）
     * @param url 目标URL
     * @param maxChars 最大字符数
     * @return 网页内容摘要
     */
    @Override
    public String fetchUrlContent(String url, int maxChars) {
        if (url == null || url.trim().isEmpty()) {
            return "错误：URL不能为空";
        }

        String normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            normalizedUrl = "https://" + normalizedUrl;
        }

        UrlFilterService.FilterResult filterResult = urlFilterService.checkUrl(normalizedUrl);
        if (filterResult.shouldFilter()) {
            if (filterResult.filterType() == UrlFilterRule.FilterType.BLOCK) {
                log.warn("URL被过滤规则拦截: {} - 规则: {}", normalizedUrl, filterResult.matchedRule());
                return "错误：该URL被安全策略拦截（原因：" + filterResult.matchedRule() + "）";
            }
            if (filterResult.filterType() == UrlFilterRule.FilterType.REDIRECT && filterResult.redirectUrl() != null) {
                log.info("URL被重定向: {} -> {}", normalizedUrl, filterResult.redirectUrl());
                normalizedUrl = filterResult.redirectUrl();
            }
        }

        try {
            log.info("正在获取URL内容: {}", normalizedUrl);

            Document doc = Jsoup.connect(normalizedUrl)
                    .userAgent(UrlConstants.USER_AGENT)
                    .timeout(UrlConstants.TIMEOUT_MS)
                    .followRedirects(true)
                    .ignoreHttpErrors(true)
                    .ignoreContentType(true)
                    .get();

            String title = doc.title();
            String bodyText = Jsoup.clean(doc.body().text(), Safelist.none());

            bodyText = bodyText.replaceAll("\\s+", " ").trim();

            if (bodyText.length() > maxChars) {
                bodyText = bodyText.substring(0, maxChars) + "...";
            }

            StringBuilder result = new StringBuilder();
            result.append("【网页标题】").append(title.isEmpty() ? "无标题" : title).append("\n");
            result.append("【来源URL】").append(normalizedUrl).append("\n");
            result.append("【内容摘要】\n").append(bodyText);

            log.info("成功获取URL内容: {} ({} 字符)", normalizedUrl, bodyText.length());
            return result.toString();

        } catch (java.net.SocketTimeoutException e) {
            log.error("获取URL超时: {}", normalizedUrl);
            return "错误：获取URL内容超时，请稍后重试";
        } catch (java.net.UnknownHostException e) {
            log.error("无法解析主机: {}", normalizedUrl);
            return "错误：无法访问该网站（域名解析失败）";
        } catch (org.jsoup.HttpStatusException e) {
            log.error("HTTP错误: {} - Status: {}", normalizedUrl, e.getStatusCode());
            return "错误：网站返回错误状态码 (" + e.getStatusCode() + ")";
        } catch (Exception e) {
            log.error("获取URL内容失败: {} - {}", normalizedUrl, e.getMessage());
            return "错误：获取URL内容失败 - " + e.getMessage();
        }
    }

    /**
     * 检查URL是否可访问
     * @param url 目标URL
     * @return 是否可访问
     */
    @Override
    public boolean isUrlAccessible(String url) {
        if (url == null || url.trim().isEmpty()) {
            return false;
        }

        String normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            normalizedUrl = "https://" + normalizedUrl;
        }

        UrlFilterService.FilterResult filterResult = urlFilterService.checkUrl(normalizedUrl);
        if (filterResult.shouldFilter() && filterResult.filterType() == UrlFilterRule.FilterType.BLOCK) {
            return false;
        }

        try {
            Jsoup.connect(normalizedUrl)
                    .userAgent(UrlConstants.USER_AGENT)
                    .timeout(5000)
                    .method(org.jsoup.Connection.Method.HEAD)
                    .followRedirects(true)
                    .ignoreHttpErrors(true)
                    .execute();
            return true;
        } catch (Exception e) {
            log.debug("URL不可访问: {} - {}", normalizedUrl, e.getMessage());
            return false;
        }
    }
}

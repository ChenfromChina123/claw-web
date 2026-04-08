package com.aispring.service.impl;

import com.aispring.entity.UrlFilterRule;
import com.aispring.service.SearchService;
import com.aispring.service.UrlFilterService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.springframework.stereotype.Service;

/**
 * 实时网络搜索服务实现类
 * 集成URL过滤功能，自动过滤搜索结果中的不良URL
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class SearchServiceImpl implements SearchService {

    private final UrlFilterService urlFilterService;

    /**
     * 根据关键词搜索相关信息
     * @param keywords 搜索关键词
     * @return 搜索结果摘要
     */
    @Override
    public String searchIndustryInfo(String keywords) {
        return searchIndustryInfo(keywords, null);
    }

    /**
     * 根据关键词在指定网站搜索相关信息
     * @param keywords 搜索关键词
     * @param site 指定网站域名，可为空
     * @return 搜索结果摘要
     */
    @Override
    public String searchIndustryInfo(String keywords, String site) {
        String searchQuery = keywords;
        if (site != null && !site.trim().isEmpty()) {
            searchQuery = keywords + " site:" + site.trim();
        }

        log.info("Searching web for query: {}", searchQuery);

        String searxngUrl = "https://search.aistudy.icu/search";
        
        try {
            log.info("Using remote SearXNG service: {}", searxngUrl);

            org.jsoup.Connection connection = Jsoup.connect(searxngUrl)
                    .data("q", searchQuery)
                    .data("format", "json")
                    .data("language", "zh-CN")
                    .ignoreContentType(true)
                    .ignoreHttpErrors(true)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                    .header("Accept", "application/json")
                    .timeout(30000);

            javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[]{
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() { return null; }
                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {}
                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {}
                }
            };
            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLSv1.2");
            sc.init(null, trustAllCerts, new java.security.SecureRandom());
            connection.sslSocketFactory(sc.getSocketFactory());

            org.jsoup.Connection.Response response = connection.execute();

            if (response.statusCode() != 200) {
                log.error("SearXNG service returned status code: {}", response.statusCode());
                return "针对关键词\"" + keywords + "\"的搜索失败，请稍后重试。";
            }

            String jsonBody = response.body();

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode rootNode = mapper.readTree(jsonBody);
            com.fasterxml.jackson.databind.JsonNode resultsNode = rootNode.path("results");

            if (resultsNode.isMissingNode() || !resultsNode.isArray() || resultsNode.isEmpty()) {
                log.warn("SearXNG returned empty results for keyword: {}", keywords);
                return "针对关键词\"" + keywords + "\"的搜索没有找到相关结果。";
            }

            StringBuilder sb = new StringBuilder();
            sb.append("针对关键词\"").append(keywords).append("\"的实时搜索结果：\n\n");
            
            int count = 0;
            int filteredCount = 0;
            for (com.fasterxml.jackson.databind.JsonNode result : resultsNode) {
                if (count >= 5) break;
                
                String title = result.path("title").asText();
                String snippet = result.path("content").asText();
                String link = result.path("url").asText();

                if (!title.isEmpty() && !snippet.isEmpty() && !link.isEmpty()) {
                    UrlFilterService.FilterResult filterResult = urlFilterService.checkUrl(link);
                    
                    if (filterResult.shouldFilter() && filterResult.filterType() == UrlFilterRule.FilterType.BLOCK) {
                        log.info("URL filtered by rule '{}': {}", filterResult.matchedRule(), link);
                        filteredCount++;
                        continue;
                    }

                    sb.append(count + 1).append(". ").append(title).append("\n");
                    sb.append("   摘要：").append(snippet).append("\n");
                    sb.append("   链接：").append(link).append("\n");
                    sb.append("\n");
                    count++;
                }
            }

            if (filteredCount > 0) {
                sb.append("注：已过滤 ").append(filteredCount).append(" 条不符合安全策略的结果。\n");
            }

            if (count > 0) {
                return sb.toString();
            } else {
                return "针对关键词\"" + keywords + "\"的搜索没有找到相关结果（可能已被安全策略过滤）。";
            }

        } catch (Exception e) {
            log.error("Web search failed for keywords: {}", keywords, e);
            return "针对关键词\"" + keywords + "\"的搜索失败，请稍后重试。";
        }
    }
}

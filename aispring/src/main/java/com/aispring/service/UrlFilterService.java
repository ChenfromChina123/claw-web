package com.aispring.service;

import com.aispring.entity.UrlFilterRule;

import java.util.List;

/**
 * URL过滤服务接口
 */
public interface UrlFilterService {

    /**
     * 创建过滤规则
     * @param rule 规则实体
     * @return 创建后的规则
     */
    UrlFilterRule createRule(UrlFilterRule rule);

    /**
     * 更新过滤规则
     * @param id 规则ID
     * @param rule 更新的规则内容
     * @return 更新后的规则
     */
    UrlFilterRule updateRule(Long id, UrlFilterRule rule);

    /**
     * 删除过滤规则
     * @param id 规则ID
     */
    void deleteRule(Long id);

    /**
     * 根据ID获取规则
     * @param id 规则ID
     * @return 规则实体
     */
    UrlFilterRule getRuleById(Long id);

    /**
     * 获取所有规则
     * @return 规则列表
     */
    List<UrlFilterRule> getAllRules();

    /**
     * 获取所有启用的规则
     * @return 启用的规则列表
     */
    List<UrlFilterRule> getEnabledRules();

    /**
     * 根据分类获取规则
     * @param category 分类名称
     * @return 规则列表
     */
    List<UrlFilterRule> getRulesByCategory(String category);

    /**
     * 启用/禁用规则
     * @param id 规则ID
     * @param enabled 是否启用
     * @return 更新后的规则
     */
    UrlFilterRule setRuleEnabled(Long id, boolean enabled);

    /**
     * 检查URL是否应该被过滤
     * @param url 待检查的URL
     * @return 过滤结果，null表示不过滤
     */
    FilterResult checkUrl(String url);

    /**
     * 过滤搜索结果中的URL
     * @param urls URL列表
     * @return 过滤后的URL列表和被过滤的URL信息
     */
    FilteredUrls filterUrls(List<String> urls);

    /**
     * 过滤结果
     */
    record FilterResult(
            boolean shouldFilter,
            UrlFilterRule.FilterType filterType,
            String redirectUrl,
            String matchedRule,
            String matchedPattern
    ) {
        public static FilterResult noMatch() {
            return new FilterResult(false, null, null, null, null);
        }
    }

    /**
     * 过滤后的URL结果
     */
    record FilteredUrls(
            List<String> allowedUrls,
            List<FilteredUrlInfo> blockedUrls
    ) {}

    /**
     * 被过滤URL信息
     */
    record FilteredUrlInfo(
            String url,
            String reason,
            String matchedRule
    ) {}
}

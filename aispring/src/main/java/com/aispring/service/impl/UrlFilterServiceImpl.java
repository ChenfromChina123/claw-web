package com.aispring.service.impl;

import com.aispring.common.CacheConstants;
import com.aispring.entity.UrlFilterRule;
import com.aispring.repository.UrlFilterRuleRepository;
import com.aispring.service.UrlFilterService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * URL过滤服务实现类
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UrlFilterServiceImpl implements UrlFilterService {

    private final UrlFilterRuleRepository ruleRepository;

    /**
     * 创建过滤规则
     * @param rule 规则实体
     * @return 创建后的规则
     */
    @Override
    @Transactional
    @CacheEvict(value = CacheConstants.RULES_CACHE, allEntries = true)
    public UrlFilterRule createRule(UrlFilterRule rule) {
        validateRule(rule);
        return ruleRepository.save(rule);
    }

    /**
     * 更新过滤规则
     * @param id 规则ID
     * @param rule 更新的规则内容
     * @return 更新后的规则
     */
    @Override
    @Transactional
    @CacheEvict(value = CacheConstants.RULES_CACHE, allEntries = true)
    public UrlFilterRule updateRule(Long id, UrlFilterRule rule) {
        UrlFilterRule existingRule = ruleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("规则不存在: " + id));

        if (rule.getName() != null) {
            existingRule.setName(rule.getName());
        }
        if (rule.getDescription() != null) {
            existingRule.setDescription(rule.getDescription());
        }
        if (rule.getFilterType() != null) {
            existingRule.setFilterType(rule.getFilterType());
        }
        if (rule.getMatchType() != null) {
            existingRule.setMatchType(rule.getMatchType());
        }
        if (rule.getPattern() != null) {
            existingRule.setPattern(rule.getPattern());
        }
        if (rule.getRedirectUrl() != null) {
            existingRule.setRedirectUrl(rule.getRedirectUrl());
        }
        if (rule.getPriority() != null) {
            existingRule.setPriority(rule.getPriority());
        }
        if (rule.getEnabled() != null) {
            existingRule.setEnabled(rule.getEnabled());
        }
        if (rule.getCategory() != null) {
            existingRule.setCategory(rule.getCategory());
        }

        validateRule(existingRule);
        return ruleRepository.save(existingRule);
    }

    /**
     * 删除过滤规则
     * @param id 规则ID
     */
    @Override
    @Transactional
    @CacheEvict(value = CacheConstants.RULES_CACHE, allEntries = true)
    public void deleteRule(Long id) {
        if (!ruleRepository.existsById(id)) {
            throw new IllegalArgumentException("规则不存在: " + id);
        }
        ruleRepository.deleteById(id);
    }

    /**
     * 根据ID获取规则
     * @param id 规则ID
     * @return 规则实体
     */
    @Override
    public UrlFilterRule getRuleById(Long id) {
        return ruleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("规则不存在: " + id));
    }

    /**
     * 获取所有规则
     * @return 规则列表
     */
    @Override
    public List<UrlFilterRule> getAllRules() {
        return ruleRepository.findAll();
    }

    /**
     * 获取所有启用的规则
     * @return 启用的规则列表
     */
    @Override
    @Cacheable(value = CacheConstants.RULES_CACHE, key = "'enabled'")
    public List<UrlFilterRule> getEnabledRules() {
        return ruleRepository.findAllEnabledOrderByPriority();
    }

    /**
     * 根据分类获取规则
     * @param category 分类名称
     * @return 规则列表
     */
    @Override
    public List<UrlFilterRule> getRulesByCategory(String category) {
        return ruleRepository.findByCategoryEnabled(category);
    }

    /**
     * 启用/禁用规则
     * @param id 规则ID
     * @param enabled 是否启用
     * @return 更新后的规则
     */
    @Override
    @Transactional
    @CacheEvict(value = CacheConstants.RULES_CACHE, allEntries = true)
    public UrlFilterRule setRuleEnabled(Long id, boolean enabled) {
        UrlFilterRule rule = getRuleById(id);
        rule.setEnabled(enabled);
        return ruleRepository.save(rule);
    }

    /**
     * 检查URL是否应该被过滤
     * @param url 待检查的URL
     * @return 过滤结果，null表示不过滤
     */
    @Override
    public FilterResult checkUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return FilterResult.noMatch();
        }

        List<UrlFilterRule> rules = getEnabledRules();
        String normalizedUrl = url.toLowerCase().trim();

        for (UrlFilterRule rule : rules) {
            if (matchesRule(normalizedUrl, rule)) {
                log.debug("URL {} matched rule: {}", url, rule.getName());
                return new FilterResult(
                        true,
                        rule.getFilterType(),
                        rule.getRedirectUrl(),
                        rule.getName(),
                        rule.getPattern()
                );
            }
        }

        return FilterResult.noMatch();
    }

    /**
     * 过滤搜索结果中的URL
     * @param urls URL列表
     * @return 过滤后的URL列表和被过滤的URL信息
     */
    @Override
    public FilteredUrls filterUrls(List<String> urls) {
        List<String> allowedUrls = new ArrayList<>();
        List<FilteredUrlInfo> blockedUrls = new ArrayList<>();

        for (String url : urls) {
            FilterResult result = checkUrl(url);
            if (result.shouldFilter() && result.filterType() == UrlFilterRule.FilterType.BLOCK) {
                blockedUrls.add(new FilteredUrlInfo(
                        url,
                        "被过滤规则拦截",
                        result.matchedRule()
                ));
            } else {
                allowedUrls.add(url);
            }
        }

        return new FilteredUrls(allowedUrls, blockedUrls);
    }

    /**
     * 检查URL是否匹配规则
     * @param url URL
     * @param rule 过滤规则
     * @return 是否匹配
     */
    private boolean matchesRule(String url, UrlFilterRule rule) {
        String pattern = rule.getPattern().toLowerCase();

        return switch (rule.getMatchType()) {
            case DOMAIN -> matchesDomain(url, pattern);
            case URL -> matchesUrl(url, pattern);
            case REGEX -> matchesRegex(url, pattern);
            case KEYWORD -> matchesKeyword(url, pattern);
        };
    }

    /**
     * 域名匹配
     * @param url URL
     * @param pattern 域名模式
     * @return 是否匹配
     */
    private boolean matchesDomain(String url, String pattern) {
        try {
            URL parsedUrl = new URL(url);
            String host = parsedUrl.getHost().toLowerCase();
            String domainPattern = pattern.toLowerCase();

            if (domainPattern.startsWith("*.")) {
                String baseDomain = domainPattern.substring(2);
                return host.equals(baseDomain) || host.endsWith("." + baseDomain);
            }
            return host.equals(domainPattern);
        } catch (MalformedURLException e) {
            log.warn("Invalid URL format: {}", url);
            return false;
        }
    }

    /**
     * URL匹配（支持通配符）
     * @param url URL
     * @param pattern URL模式
     * @return 是否匹配
     */
    private boolean matchesUrl(String url, String pattern) {
        String regexPattern = pattern
                .replace(".", "\\.")
                .replace("*", ".*")
                .replace("?", ".");
        return url.matches(regexPattern);
    }

    /**
     * 正则表达式匹配
     * @param url URL
     * @param pattern 正则表达式
     * @return 是否匹配
     */
    private boolean matchesRegex(String url, String pattern) {
        try {
            return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(url).find();
        } catch (PatternSyntaxException e) {
            log.error("Invalid regex pattern: {}", pattern, e);
            return false;
        }
    }

    /**
     * 关键词匹配
     * @param url URL
     * @param keyword 关键词
     * @return 是否匹配
     */
    private boolean matchesKeyword(String url, String keyword) {
        return url.toLowerCase().contains(keyword.toLowerCase());
    }

    /**
     * 验证规则
     * @param rule 规则实体
     */
    private void validateRule(UrlFilterRule rule) {
        if (rule.getName() == null || rule.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        if (rule.getPattern() == null || rule.getPattern().trim().isEmpty()) {
            throw new IllegalArgumentException("匹配模式不能为空");
        }
        if (rule.getFilterType() == null) {
            throw new IllegalArgumentException("过滤类型不能为空");
        }
        if (rule.getMatchType() == null) {
            throw new IllegalArgumentException("匹配类型不能为空");
        }

        if (rule.getMatchType() == UrlFilterRule.MatchType.REGEX) {
            try {
                Pattern.compile(rule.getPattern());
            } catch (PatternSyntaxException e) {
                throw new IllegalArgumentException("无效的正则表达式: " + e.getMessage());
            }
        }

        if (rule.getFilterType() == UrlFilterRule.FilterType.REDIRECT &&
            (rule.getRedirectUrl() == null || rule.getRedirectUrl().trim().isEmpty())) {
            throw new IllegalArgumentException("重定向类型规则必须指定重定向URL");
        }
    }
}

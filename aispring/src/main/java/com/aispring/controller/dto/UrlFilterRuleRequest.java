package com.aispring.controller.dto;

import com.aispring.entity.UrlFilterRule;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * URL过滤规则请求DTO
 */
@Data
public class UrlFilterRuleRequest {

    @NotBlank(message = "规则名称不能为空")
    private String name;

    private String description;

    @NotNull(message = "过滤类型不能为空")
    private UrlFilterRule.FilterType filterType;

    @NotNull(message = "匹配类型不能为空")
    private UrlFilterRule.MatchType matchType;

    @NotBlank(message = "匹配模式不能为空")
    private String pattern;

    private String redirectUrl;

    private Integer priority = 100;

    private Boolean enabled = true;

    private String category;
}

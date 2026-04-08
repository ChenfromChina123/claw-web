package com.aispring.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * PRD 生成请求（参考 prd 项目 /generate_prd）
 */
@Data
public class PrdGenerateRequest {

    /** 项目想法 / 高层需求描述 */
    @NotBlank(message = "项目想法不能为空")
    private String idea;

    /** 自主程度：Full 全自动 / Supervised 需人工确认（预留） */
    private String autonomyLevel = "Full";

    /** 适配器：vanilla_openai / vanilla_google 等（预留，当前统一用现有 AI） */
    private String adapter = "vanilla_openai";
}

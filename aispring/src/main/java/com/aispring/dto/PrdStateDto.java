package com.aispring.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * PRD 流程状态（与 prd 项目 PRDState 对齐，用于 SSE 推送）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PrdStateDto {

    /** 当前步骤 */
    private String step;

    /** 当前完整 Markdown 内容 */
    private String content;

    /** 修订版本号 */
    private Integer revision;

    /** 与上一版的 diff（可选） */
    private String diff;
}

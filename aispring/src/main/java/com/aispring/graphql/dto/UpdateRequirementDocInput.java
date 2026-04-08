package com.aispring.graphql.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 更新需求文档输入
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateRequirementDocInput {
    
    /**
     * 文档标题（可选）
     */
    private String title;
    
    /**
     * 文档内容（可选）
     */
    private String content;
}

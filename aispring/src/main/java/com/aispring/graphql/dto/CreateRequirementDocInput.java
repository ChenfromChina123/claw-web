package com.aispring.graphql.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 创建需求文档输入
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateRequirementDocInput {
    
    /**
     * 文档标题
     */
    private String title;
    
    /**
     * 文档内容
     */
    private String content;
}

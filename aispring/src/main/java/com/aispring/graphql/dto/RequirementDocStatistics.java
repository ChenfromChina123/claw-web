package com.aispring.graphql.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 需求文档统计信息（独立片段）
 * 
 * 使用场景：
 * - 文档详情页需要展示统计信息
 * - 列表页不需要加载，节省计算资源
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RequirementDocStatistics {
    
    /**
     * 文档字数
     */
    private Integer wordCount;
    
    /**
     * 编辑次数
     */
    private Integer editCount;
    
    /**
     * 最后编辑时间
     */
    private LocalDateTime lastEditedAt;
    
    /**
     * 是否已发布
     */
    private Boolean published;
}

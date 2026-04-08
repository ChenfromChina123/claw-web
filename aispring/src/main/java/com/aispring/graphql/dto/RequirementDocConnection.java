package com.aispring.graphql.dto;

import com.aispring.entity.RequirementDoc;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * GraphQL 分页连接对象
 * 用于返回分页结果
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RequirementDocConnection {
    
    /**
     * 文档列表
     */
    private List<RequirementDoc> content;
    
    /**
     * 分页信息
     */
    private PageInfo pageInfo;
    
    /**
     * 从 Spring Data Page 对象转换
     */
    public static RequirementDocConnection fromPage(Page<RequirementDoc> page) {
        PageInfo pageInfo = PageInfo.builder()
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .hasNext(page.hasNext())
                .build();
        
        return RequirementDocConnection.builder()
                .content(page.getContent())
                .pageInfo(pageInfo)
                .build();
    }
}

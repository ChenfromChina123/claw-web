package com.aispring.dto.request;

import lombok.Data;

/**
 * 资源请求DTO
 * 用于接收资源相关的请求参数
 */
@Data
public class ResourceRequest {
    
    private String title;
    
    private String url;
    
    private String description;
    
    private String categoryName;
    
    private Integer isPublic = 1;

    private String version;

    private String type;
}
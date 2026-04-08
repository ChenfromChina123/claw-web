package com.aispring.service;

import com.aispring.entity.Resource;

import java.util.List;

/**
 * 资源服务接口
 */
public interface ResourceService {
    
    /**
     * 创建资源
     */
    Resource createResource(Resource resource, String categoryName);
    
    /**
     * 获取所有资源
     */
    List<Resource> getAllResources();
    
    /**
     * 根据ID获取资源
     */
    Resource getResourceById(Long id);
    
    /**
     * 更新资源
     */
    Resource updateResource(Long id, Resource resource, String categoryName);
    
    /**
     * 删除资源
     */
    void deleteResource(Long id);
    
    /**
     * 根据分类获取资源
     */
    List<Resource> getResourcesByCategory(String categoryName);
    
    /**
     * 获取公开资源
     */
    List<Resource> getPublicResources();
}
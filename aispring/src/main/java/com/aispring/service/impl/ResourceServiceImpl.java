package com.aispring.service.impl;

import com.aispring.entity.Category;
import com.aispring.entity.Resource;
import com.aispring.repository.CategoryRepository;
import com.aispring.repository.ResourceRepository;
import com.aispring.service.ResourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 资源服务实现类
 */
@Service
@RequiredArgsConstructor
public class ResourceServiceImpl implements ResourceService {
    
    private final ResourceRepository resourceRepository;
    private final CategoryRepository categoryRepository;
    
    @Override
    @Transactional
    public Resource createResource(Resource resource, String categoryName) {
        // 获取或创建分类
        Category category = categoryRepository.findByName(categoryName)
                .orElseGet(() -> {
                    Category newCategory = Category.builder()
                            .name(categoryName)
                            .build();
                    return categoryRepository.save(newCategory);
                });
        
        resource.setCategory(category);
        return resourceRepository.save(resource);
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<Resource> getAllResources() {
        return resourceRepository.findAll();
    }
    
    @Override
    @Transactional(readOnly = true)
    public Resource getResourceById(Long id) {
        return resourceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("资源不存在"));
    }
    
    @Override
    @Transactional
    public Resource updateResource(Long id, Resource resource, String categoryName) {
        Resource existingResource = getResourceById(id);
        
        // 更新资源基本信息
        existingResource.setTitle(resource.getTitle());
        existingResource.setUrl(resource.getUrl());
        existingResource.setDescription(resource.getDescription());
        existingResource.setIsPublic(resource.getIsPublic());
        existingResource.setVersion(resource.getVersion());
        existingResource.setFilePath(resource.getFilePath());
        existingResource.setType(resource.getType());
        
        // 更新分类
        if (categoryName != null && !categoryName.isEmpty()) {
            Category category = categoryRepository.findByName(categoryName)
                    .orElseGet(() -> {
                        Category newCategory = Category.builder()
                                .name(categoryName)
                                .build();
                        return categoryRepository.save(newCategory);
                    });
            existingResource.setCategory(category);
        }
        
        return resourceRepository.save(existingResource);
    }
    
    @Override
    @Transactional
    public void deleteResource(Long id) {
        Resource resource = getResourceById(id);
        resourceRepository.delete(resource);
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<Resource> getResourcesByCategory(String categoryName) {
        Category category = categoryRepository.findByName(categoryName)
                .orElseThrow(() -> new IllegalArgumentException("分类不存在"));
        
        return resourceRepository.findByCategoryId(category.getId());
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<Resource> getPublicResources() {
        return resourceRepository.findByIsPublic(1);
    }
}
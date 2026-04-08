package com.aispring.service;

import com.aispring.entity.Category;

import java.util.List;

/**
 * 分类服务接口
 */
public interface CategoryService {
    
    /**
     * 创建分类
     */
    Category createCategory(Category category);
    
    /**
     * 获取所有分类
     */
    List<Category> getAllCategories();
    
    /**
     * 根据ID获取分类
     */
    Category getCategoryById(Long id);
    
    /**
     * 根据名称获取分类
     */
    Category getCategoryByName(String name);
    
    /**
     * 更新分类
     */
    Category updateCategory(Long id, Category category);
    
    /**
     * 删除分类
     */
    void deleteCategory(Long id);
    
    /**
     * 检查分类是否存在
     */
    boolean existsByName(String name);
}
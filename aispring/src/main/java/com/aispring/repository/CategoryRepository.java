package com.aispring.repository;

import com.aispring.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 分类仓库接口
 */
@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {
    
    /**
     * 根据名称查找分类
     */
    Optional<Category> findByName(String name);
    
    /**
     * 检查分类名称是否存在
     */
    boolean existsByName(String name);
}
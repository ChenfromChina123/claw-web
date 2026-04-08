package com.aispring.repository;

import com.aispring.entity.Resource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 资源仓库接口
 */
@Repository
public interface ResourceRepository extends JpaRepository<Resource, Long> {
    
    /**
     * 根据分类ID查找资源
     */
    List<Resource> findByCategoryId(Long categoryId);
    
    /**
     * 根据是否公开查找资源
     */
    List<Resource> findByIsPublic(Integer isPublic);
    
    /**
     * 根据分类ID和是否公开查找资源
     */
    List<Resource> findByCategoryIdAndIsPublic(Long categoryId, Integer isPublic);
}


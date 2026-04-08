package com.aispring.repository;

import com.aispring.entity.CustomModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 自定义模型仓库接口
 */
@Repository
public interface CustomModelRepository extends JpaRepository<CustomModel, Long> {
    
    /**
     * 根据用户ID查找所有自定义模型
     */
    List<CustomModel> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据用户ID查找激活的模型
     */
    List<CustomModel> findByUserIdAndIsActiveTrueOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据用户ID和模型ID查找
     */
    Optional<CustomModel> findByIdAndUserId(Long id, Long userId);
}


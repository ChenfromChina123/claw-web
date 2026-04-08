package com.aispring.repository;

import com.aispring.entity.Feedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 反馈仓库接口
 */
@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Long> {
    
    /**
     * 根据用户ID查找反馈
     */
    List<Feedback> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据状态查找反馈
     */
    List<Feedback> findByStatusOrderByCreatedAtDesc(String status);
    
    /**
     * 查找所有反馈（管理员）
     */
    List<Feedback> findAllByOrderByCreatedAtDesc();
}


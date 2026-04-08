package com.aispring.repository;

import com.aispring.entity.RequirementDoc;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 需求文档数据访问层
 */
@Repository
public interface RequirementDocRepository extends JpaRepository<RequirementDoc, Long> {
    
    /**
     * 根据用户ID查询需求文档列表
     */
    List<RequirementDoc> findByUserId(Long userId);
    
    /**
     * 根据用户ID查询需求文档列表（按更新时间倒序）
     */
    List<RequirementDoc> findByUserIdOrderByUpdatedAtDesc(Long userId);
    
    /**
     * 根据用户ID分页查询需求文档
     */
    Page<RequirementDoc> findByUserId(Long userId, Pageable pageable);
    
    /**
     * 根据标题搜索（模糊匹配）
     */
    List<RequirementDoc> findByTitleContaining(String keyword);
}

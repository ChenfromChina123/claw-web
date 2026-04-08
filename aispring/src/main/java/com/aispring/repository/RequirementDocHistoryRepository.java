package com.aispring.repository;

import com.aispring.entity.RequirementDocHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 需求文档历史版本数据访问层
 */
@Repository
public interface RequirementDocHistoryRepository extends JpaRepository<RequirementDocHistory, Long> {
    
    /**
     * 根据文档ID查询历史版本列表（按版本号倒序）
     */
    List<RequirementDocHistory> findByDocIdOrderByVersionDesc(Long docId);
    
    /**
     * 根据文档ID列表批量查询历史版本
     * 用于 DataLoader 批量加载
     */
    List<RequirementDocHistory> findByDocIdIn(List<Long> docIds);
    
    /**
     * 统计文档的历史版本数量
     */
    int countByDocId(Long docId);
}

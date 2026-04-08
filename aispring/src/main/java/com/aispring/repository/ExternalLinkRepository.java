package com.aispring.repository;

import com.aispring.entity.ExternalLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 外部链接数据访问层
 */
@Repository
public interface ExternalLinkRepository extends JpaRepository<ExternalLink, Long> {
    
    /**
     * 查询所有激活的链接，按点击次数倒序排列
     */
    List<ExternalLink> findByIsActiveTrueOrderByClickCountDescSortOrderAsc();
    
    /**
     * 增加点击次数（原子操作，自动提交事务）
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE ExternalLink e SET e.clickCount = e.clickCount + 1, e.updatedAt = CURRENT_TIMESTAMP WHERE e.id = :id")
    void incrementClickCount(@Param("id") Long id);
}

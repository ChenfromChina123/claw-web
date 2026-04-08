package com.aispring.repository;

import com.aispring.entity.UserLearningRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 用户学习记录仓库接口
 */
@Repository
public interface UserLearningRecordRepository extends JpaRepository<UserLearningRecord, Long> {
    
    /**
     * 根据用户ID查找学习记录
     */
    List<UserLearningRecord> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据用户ID和活动类型查找
     */
    List<UserLearningRecord> findByUserIdAndActivityTypeOrderByCreatedAtDesc(Long userId, String activityType);
    
    /**
     * 根据用户ID和时间范围查找
     */
    @Query("SELECT r FROM UserLearningRecord r WHERE r.userId = :userId AND r.createdAt BETWEEN :startTime AND :endTime ORDER BY r.createdAt DESC")
    List<UserLearningRecord> findByUserIdAndTimeRange(@Param("userId") Long userId, 
                                                       @Param("startTime") LocalDateTime startTime, 
                                                       @Param("endTime") LocalDateTime endTime);
    
    /**
     * 统计用户总学习时长
     */
    @Query("SELECT COALESCE(SUM(r.duration), 0) FROM UserLearningRecord r WHERE r.userId = :userId")
    Long getTotalDuration(@Param("userId") Long userId);
    
    /**
     * 统计用户今日学习时长
     */
    @Query("SELECT COALESCE(SUM(r.duration), 0) FROM UserLearningRecord r WHERE r.userId = :userId AND CAST(r.createdAt AS date) = CURRENT_DATE")
    Long getTodayDuration(@Param("userId") Long userId);
}


package com.aispring.repository;

import com.aispring.entity.PracticeRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 练习记录数据访问接口
 */
@Repository
public interface PracticeRecordRepository extends JpaRepository<PracticeRecord, Long> {
    
    /**
     * 根据用户 ID 查找练习记录（按时间倒序）
     */
    List<PracticeRecord> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据用户 ID 和单词 ID 查找练习记录
     */
    List<PracticeRecord> findByUserIdAndWordIdOrderByCreatedAtDesc(Long userId, Integer wordId);
    
    /**
     * 根据用户 ID 和练习类型查找
     */
    List<PracticeRecord> findByUserIdAndPracticeTypeOrderByCreatedAtDesc(Long userId, String practiceType);
    
    /**
     * 根据用户 ID 和时间范围查找练习记录
     */
    @Query("SELECT pr FROM PracticeRecord pr WHERE pr.userId = :userId " +
           "AND pr.createdAt BETWEEN :startTime AND :endTime ORDER BY pr.createdAt DESC")
    List<PracticeRecord> findByUserIdAndTimeRange(
        @Param("userId") Long userId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime
    );
    
    /**
     * 统计用户总练习次数
     */
    @Query("SELECT COUNT(pr) FROM PracticeRecord pr WHERE pr.userId = :userId")
    Long countByUserId(@Param("userId") Long userId);
    
    /**
     * 统计用户指定单词的练习次数
     */
    Long countByUserIdAndWordId(Long userId, Integer wordId);
    
    /**
     * 统计用户正确练习次数
     */
    @Query("SELECT COUNT(pr) FROM PracticeRecord pr " +
           "WHERE pr.userId = :userId AND pr.isCorrect = true")
    Long countCorrectByUserId(@Param("userId") Long userId);
    
    /**
     * 计算用户练习正确率
     */
    @Query("SELECT COALESCE(CAST(SUM(CASE WHEN pr.isCorrect = true THEN 1 ELSE 0 END) AS DOUBLE) " +
           "* 100 / COUNT(pr), 0) FROM PracticeRecord pr WHERE pr.userId = :userId")
    Double getAccuracyRate(@Param("userId") Long userId);
    
    /**
     * 计算用户平均练习得分
     */
    @Query("SELECT COALESCE(AVG(pr.score), 0) FROM PracticeRecord pr WHERE pr.userId = :userId")
    Double getAverageScore(@Param("userId") Long userId);
    
    /**
     * 获取用户今日练习次数
     */
    @Query("SELECT COUNT(pr) FROM PracticeRecord pr " +
           "WHERE pr.userId = :userId AND CAST(pr.createdAt AS date) = CURRENT_DATE")
    Long countTodayByUserId(@Param("userId") Long userId);
    
    /**
     * 按练习类型统计用户练习次数
     */
    @Query("SELECT pr.practiceType, COUNT(pr) FROM PracticeRecord pr " +
           "WHERE pr.userId = :userId GROUP BY pr.practiceType")
    List<Object[]> countByUserIdAndPracticeType(@Param("userId") Long userId);
}

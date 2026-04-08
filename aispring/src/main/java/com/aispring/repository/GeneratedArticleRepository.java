package com.aispring.repository;

import com.aispring.entity.GeneratedArticle;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * AI生成文章仓库接口
 */
@Repository
public interface GeneratedArticleRepository extends JpaRepository<GeneratedArticle, Integer> {
    
    /**
     * 根据用户ID查找文章
     */
    @Query("select a from GeneratedArticle a where a.userId = :userId and (a.isDeleted = false or a.isDeleted is null) order by a.createdAt desc")
    List<GeneratedArticle> findByUserIdOrderByCreatedAtDesc(@Param("userId") Long userId);

    @Query("""
        select a from GeneratedArticle a
        where a.userId = :userId
          and (a.isDeleted = false or a.isDeleted is null)
          and (:keyword is null or :keyword = '' or lower(a.topic) like lower(concat('%', :keyword, '%')))
          and (:targetLanguage is null or :targetLanguage = '' or a.targetLanguage = :targetLanguage)
          and (:startTime is null or a.createdAt >= :startTime)
          and (:endTime is null or a.createdAt <= :endTime)
        """)
    Page<GeneratedArticle> searchByUserWithFilters(@Param("userId") Long userId,
                                                   @Param("keyword") String keyword,
                                                   @Param("targetLanguage") String targetLanguage,
                                                   @Param("startTime") LocalDateTime startTime,
                                                   @Param("endTime") LocalDateTime endTime,
                                                   Pageable pageable);

    @Query("select a from GeneratedArticle a where a.id = :id and a.userId = :userId and (a.isDeleted = false or a.isDeleted is null)")
    Optional<GeneratedArticle> findByIdAndUserId(@Param("id") Integer id, @Param("userId") Long userId);

    @Modifying
    @Query("update GeneratedArticle a set a.isDeleted = true where a.userId = :userId and a.id in :ids")
    int softDeleteByUserAndIds(@Param("userId") Long userId, @Param("ids") List<Integer> ids);

    @Modifying
    @Query("update GeneratedArticle a set a.isDeleted = true where a.userId = :userId and (a.isDeleted = false or a.isDeleted is null)")
    int softDeleteAllByUser(@Param("userId") Long userId);
}

package com.aispring.repository;

import com.aispring.entity.VocabularyList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 单词表仓库接口
 */
@Repository
public interface VocabularyListRepository extends JpaRepository<VocabularyList, Integer> {
    
    /**
     * 根据用户ID查找单词表
     */
    List<VocabularyList> findByCreatedByOrderByCreatedAtDesc(Long userId);
    
    /**
     * 查找公共单词表
     */
    List<VocabularyList> findByIsPublicTrueOrderByCreatedAtDesc();
    
    /**
     * 查找预设单词表
     */
    List<VocabularyList> findByIsPresetTrueOrderByCreatedAtDesc();
    
    /**
     * 根据语言查找公共单词表
     */
    List<VocabularyList> findByLanguageAndIsPublicTrueOrderByCreatedAtDesc(String language);
    
    /**
     * 根据用户ID和语言查找单词表
     */
    List<VocabularyList> findByCreatedByAndLanguageOrderByCreatedAtDesc(Long userId, String language);
    
    /**
     * 查找用户的单词表或公共单词表
     */
    @Query("SELECT v FROM VocabularyList v WHERE (v.createdBy = :userId OR v.isPublic = true) ORDER BY v.createdAt DESC")
    List<VocabularyList> findByUserIdOrPublic(@Param("userId") Long userId);
}


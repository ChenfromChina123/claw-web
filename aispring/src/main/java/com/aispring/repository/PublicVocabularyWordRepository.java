package com.aispring.repository;

import com.aispring.entity.PublicVocabularyWord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 公共单词库仓库接口
 */
@Repository
public interface PublicVocabularyWordRepository extends JpaRepository<PublicVocabularyWord, Integer> {
    
    /**
     * 根据单词和语言查找
     */
    Optional<PublicVocabularyWord> findByWordAndLanguage(String word, String language);
    
    /**
     * 根据语言查找所有单词
     */
    List<PublicVocabularyWord> findByLanguageOrderByUsageCountDesc(String language);
    
    /**
     * 根据标签查找单词
     */
    List<PublicVocabularyWord> findByTagOrderByUsageCountDesc(String tag);
    
    /**
     * 根据语言和标签查找单词
     */
    List<PublicVocabularyWord> findByLanguageAndTagOrderByUsageCountDesc(String language, String tag);
    
    /**
     * 搜索单词（模糊匹配）
     */
    @Query("SELECT p FROM PublicVocabularyWord p WHERE p.language = :language AND p.word LIKE %:keyword% ORDER BY p.usageCount DESC")
    List<PublicVocabularyWord> searchByKeyword(@Param("language") String language, @Param("keyword") String keyword);

    @Query("SELECT p FROM PublicVocabularyWord p WHERE p.language = :language AND p.word LIKE %:keyword% ORDER BY p.usageCount DESC")
    Page<PublicVocabularyWord> searchByKeywordPaged(@Param("language") String language, @Param("keyword") String keyword, Pageable pageable);

    Page<PublicVocabularyWord> findByLanguageOrderByUsageCountDesc(String language, Pageable pageable);

    @Query("""
        select p from PublicVocabularyWord p
        where (:language is null or :language = '' or p.language = :language)
          and (:keyword is null or :keyword = '' or lower(p.word) like lower(concat('%', :keyword, '%')) or lower(p.definition) like lower(concat('%', :keyword, '%')))
          and (:category is null or :category = '' or lower(coalesce(p.tag, '')) like lower(concat('%', :category, '%')))
        order by p.usageCount desc, p.id asc
        """)
    Page<PublicVocabularyWord> searchForArticleWordLibrary(@Param("language") String language,
                                                           @Param("keyword") String keyword,
                                                           @Param("category") String category,
                                                           Pageable pageable);
    
    /**
     * 获取最常用的单词
     */
    List<PublicVocabularyWord> findTop100ByLanguageOrderByUsageCountDesc(String language);
}


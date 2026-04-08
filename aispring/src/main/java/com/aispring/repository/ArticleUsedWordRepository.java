package com.aispring.repository;

import com.aispring.entity.ArticleUsedWord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 文章使用单词仓库接口
 */
@Repository
public interface ArticleUsedWordRepository extends JpaRepository<ArticleUsedWord, Integer> {
    
    /**
     * 根据文章ID查找单词
     */
    List<ArticleUsedWord> findByArticleId(Integer articleId);

    @Query("select auw from ArticleUsedWord auw left join fetch auw.word where auw.articleId = :articleId")
    List<ArticleUsedWord> findByArticleIdWithWord(@Param("articleId") Integer articleId);

    @Modifying
    void deleteByArticleIdIn(List<Integer> articleIds);
}

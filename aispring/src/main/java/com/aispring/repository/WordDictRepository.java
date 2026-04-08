package com.aispring.repository;

import com.aispring.entity.WordDict;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 单词词典仓储接口
 * 支持从 ECDICT 导入的 300万+ 词库查询
 */
@Repository
public interface WordDictRepository extends JpaRepository<WordDict, Long> {

    Optional<WordDict> findByWord(String word);

    Optional<WordDict> findByWordIgnoreCase(String word);

    List<WordDict> findByLevelTagsContaining(String tag);

    Page<WordDict> findByLevelTagsContaining(String tag, Pageable pageable);

    @Query("SELECT w FROM WordDict w WHERE w.word LIKE %:keyword% OR w.translation LIKE %:keyword%")
    Page<WordDict> searchByKeyword(@Param("keyword") String keyword, Pageable pageable);

    /**
     * 根据英文单词列表批量查询（用于语义搜索）
     * 返回匹配任意单词的记录，按匹配优先级排序
     */
    @Query("SELECT w FROM WordDict w WHERE w.word IN :words")
    List<WordDict> findByWordIn(@Param("words") List<String> words);

    /**
     * 根据英文单词前缀匹配查询（用于语义搜索扩展）
     */
    @Query("SELECT w FROM WordDict w WHERE LOWER(w.word) LIKE LOWER(CONCAT(:prefix, '%'))")
    List<WordDict> findByWordPrefix(@Param("prefix") String prefix, Pageable pageable);

    /**
     * 智能搜索：支持英文单词精确匹配和前缀匹配
     */
    @Query("SELECT w FROM WordDict w WHERE " +
           "LOWER(w.word) = LOWER(:keyword) OR " +
           "LOWER(w.word) LIKE LOWER(CONCAT(:keyword, '%')) OR " +
           "w.translation LIKE %:keyword%")
    List<WordDict> smartSearch(@Param("keyword") String keyword, Pageable pageable);

    @Query("SELECT w FROM WordDict w WHERE w.levelTags LIKE %:level% ORDER BY RAND() LIMIT :limit")
    List<WordDict> findRandomWordsByLevel(@Param("level") String level, @Param("limit") int limit);

    @Query("SELECT w FROM WordDict w ORDER BY RAND() LIMIT :limit")
    List<WordDict> findRandomWords(@Param("limit") int limit);

    boolean existsByWord(String word);

    long countByLevelTagsContaining(String tag);
}

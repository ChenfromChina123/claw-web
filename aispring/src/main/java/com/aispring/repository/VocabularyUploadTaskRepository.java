package com.aispring.repository;

import com.aispring.entity.VocabularyUploadTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 词汇上传任务仓库接口
 */
@Repository
public interface VocabularyUploadTaskRepository extends JpaRepository<VocabularyUploadTask, Long> {
    
    /**
     * 根据任务ID查找任务
     */
    Optional<VocabularyUploadTask> findByTaskId(String taskId);
    
    /**
     * 根据单词表ID查找任务
     */
    Optional<VocabularyUploadTask> findByVocabularyListId(Integer vocabularyListId);
}


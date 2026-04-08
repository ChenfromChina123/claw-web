package com.aispring.repository;

import com.aispring.entity.Note;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 笔记仓库接口
 */
@Repository
public interface NoteRepository extends JpaRepository<Note, Long> {
    
    /**
     * 根据用户ID查找所有笔记
     */
    List<Note> findByUserIdOrderByUpdatedAtDesc(Long userId);
    
    /**
     * 根据用户ID和笔记ID查找
     */
    Optional<Note> findByIdAndUserId(Long id, Long userId);
    
    /**
     * 根据文件路径查找笔记
     */
    Optional<Note> findByFilePath(String filePath);
}


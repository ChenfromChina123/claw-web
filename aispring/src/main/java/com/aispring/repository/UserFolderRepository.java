package com.aispring.repository;

import com.aispring.entity.UserFolder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 用户文件夹仓库接口
 */
@Repository
public interface UserFolderRepository extends JpaRepository<UserFolder, Long> {
    
    /**
     * 根据用户ID查找所有文件夹
     */
    List<UserFolder> findByUser_IdOrderByIdAsc(Long userId);
    
    /**
     * 根据用户ID和父文件夹ID查找子文件夹
     */
    List<UserFolder> findByUser_IdAndParentPathOrderByIdAsc(Long userId, String parentPath);
    
    /**
     * 根据用户ID和文件夹名称查找
     */
    Optional<UserFolder> findByUser_IdAndFolderName(Long userId, String folderName);
    
    /**
     * 根据用户ID和文件夹路径查找
     */
    Optional<UserFolder> findByUser_IdAndFolderPath(Long userId, String folderPath);
    
    /**
     * 检查用户是否已存在指定路径的文件夹
     */
    boolean existsByUser_IdAndFolderPath(Long userId, String folderPath);
    
    /**
     * 根据用户ID和文件夹ID查找
     */
    Optional<UserFolder> findByIdAndUser_Id(Long id, Long userId);

    /**
     * 查找以指定路径开头的所有文件夹（用于查找子文件夹）
     */
    List<UserFolder> findByUser_IdAndFolderPathStartingWith(Long userId, String prefix);
}


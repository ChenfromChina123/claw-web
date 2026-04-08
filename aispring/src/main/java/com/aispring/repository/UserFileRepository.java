package com.aispring.repository;

import com.aispring.entity.UserFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 用户文件仓库接口
 */
@Repository
public interface UserFileRepository extends JpaRepository<UserFile, Long> {
    
    /**
     * 获取所有文件并立即加载用户信息（用于管理后台）
     */
    @Query("SELECT f FROM UserFile f JOIN FETCH f.user")
    List<UserFile> findAllWithUser();

    /**
     * 根据ID查找文件并立即加载用户信息
     */
    @Query("SELECT f FROM UserFile f JOIN FETCH f.user WHERE f.id = :id")
    Optional<UserFile> findByIdWithUser(@Param("id") Long id);

    /**
     * 根据用户ID查找所有文件
     */
    List<UserFile> findByUser_IdOrderByUploadTimeDesc(Long userId);
    
    /**
     * 根据用户ID和文件夹ID查找文件
     */
    List<UserFile> findByUser_IdAndFolderPathOrderByUploadTimeDesc(Long userId, String folderPath);

    Optional<UserFile> findFirstByUser_IdAndFolderPathInAndFilename(Long userId, List<String> folderPaths, String filename);

    boolean existsByUser_IdAndFolderPathInAndFilename(Long userId, List<String> folderPaths, String filename);

    boolean existsByUser_IdAndFolderPathInAndFilenameIgnoreCaseAndIdNot(Long userId, List<String> folderPaths, String filename, Long id);
    
    /**
     * 根据用户ID和文件ID查找
     */
    Optional<UserFile> findByIdAndUserId(Long id, Long userId);
    
    /**
     * 根据文件路径查找
     */
    Optional<UserFile> findByFilepath(String filepath);

    /**
     * 计算用户已使用的存储空间（单位：字节）
     */
    @Query("SELECT COALESCE(SUM(f.fileSize), 0) FROM UserFile f WHERE f.user.id = :userId")
    Long sumFileSizeByUserId(@Param("userId") Long userId);
    /**
     * 计算所有用户已使用的存储空间（单位：字节）
     */
    @Query("SELECT COALESCE(SUM(f.fileSize), 0) FROM UserFile f")
    Long sumAllFileSizes();
}


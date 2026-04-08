package com.aispring.service;

import com.aispring.entity.User;
import com.aispring.entity.UserFile;
import com.aispring.entity.UserFolder;
import com.aispring.repository.UserFileRepository;
import com.aispring.repository.UserFolderRepository;
import com.aispring.repository.UserRepository;
import com.aispring.utils.FileUtils;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import com.aispring.config.StorageProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;



import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import java.util.ArrayList;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 云盘服务
 * 对应Python: app.py中的云盘相关功能
 */
@Service
@RequiredArgsConstructor
public class CloudDiskService {
    
    private static final Logger log = LoggerFactory.getLogger(CloudDiskService.class);
    
    private final UserFileRepository userFileRepository;
    private final UserFolderRepository userFolderRepository;
    private final UserRepository userRepository;
    private final StorageProperties storageProperties;

    private String getCloudDiskAbsolutePath() {
        return storageProperties.getCloudDiskAbsolute();
    }

    private void ensureUserDirectoryExists(Long userId) {
        try {
            Path userBase = Paths.get(getCloudDiskAbsolutePath()).resolve(String.valueOf(userId)).normalize();
            Files.createDirectories(userBase);
        } catch (Exception ignore) {}
    }
    
    private String normalizePath(String p) {
        if (p == null) return "";
        String s = p.trim();
        if (s.equals("/") || s.equals("")) return "";
        // 去掉首尾斜杠
        while (s.startsWith("/")) s = s.substring(1);
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private String normalizeFolderPathForDb(String folderPath) {
        if (folderPath == null) return "/";
        String s = folderPath.trim();
        if (s.isEmpty() || s.equals("-") || s.equalsIgnoreCase("null")) return "/";
        if (!s.startsWith("/")) s = "/" + s;
        if (s.length() > 1 && s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private List<String> buildFolderPathCandidates(String folderPath) {
        String db = normalizeFolderPathForDb(folderPath);
        String norm = normalizePath(folderPath);
        List<String> candidates = new ArrayList<>();
        candidates.add(db);
        if (!norm.isEmpty()) {
            candidates.add("/" + norm);
            candidates.add(norm);
        } else {
            candidates.add("");
        }
        return candidates.stream().distinct().toList();
    }
    
    /**
     * 获取用户存储配额信息
     */
    public QuotaInfo getQuota(Long userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
            
        long usedSize = userFileRepository.sumFileSizeByUserId(userId);
        long limitSize = user.isAdmin() ? -1L : 1024L * 1024L * 1024L; // -1 表示无限制
        
        return new QuotaInfo(usedSize, limitSize, user.isAdmin());
    }

    @Data
    @AllArgsConstructor
    public static class QuotaInfo {
        private long usedSize;
        private long limitSize;
        private boolean isAdmin;
    }

    /**
     * 初始化用户文件夹结构
     */
    @Transactional(rollbackFor = Exception.class)
    public void initUserFolderStructure(Long userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        
        // 检查根目录是否已存在，不存在则创建
        if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, "/")) {
            UserFolder rootFolder = new UserFolder();
            rootFolder.setUser(user);
            rootFolder.setFolderName("根目录");
            rootFolder.setFolderPath("/");
            rootFolder.setParentPath(null);
            userFolderRepository.save(rootFolder);
        }
        
        // 检查笔记文件夹是否已存在，不存在则创建
        if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, "/笔记")) {
            UserFolder notesFolder = new UserFolder();
            notesFolder.setUser(user);
            notesFolder.setFolderName("笔记");
            notesFolder.setFolderPath("/笔记");
            notesFolder.setParentPath("/");
            userFolderRepository.save(notesFolder);
        }
        
        // 创建物理文件夹
        ensureUserDirectoryExists(userId);
        String userDiskPath = getCloudDiskAbsolutePath() + "/" + userId;
        new File(userDiskPath + "/笔记").mkdirs();

        // 同步文件和文件夹结构
        synchronizeUserFilesAndFolders(userId);
    }
    
    /**
     * 获取用户的文件夹树
     */
    public List<UserFolder> getUserFolders(Long userId) {
        // 先通过JPA方法获取文件夹列表，再添加额外过滤确保只返回当前用户的文件夹
        return userFolderRepository.findByUser_IdOrderByIdAsc(userId)
                .stream()
                // 双重验证：确保文件夹的user_id与当前用户ID匹配
                .filter(folder -> folder.getUser().getId().equals(userId))
                .toList();
    }
    
    /**
     * 创建文件夹
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFolder createFolder(Long userId, String folderName, String folderPath, Long parentId) {
        if (folderName == null || folderName.trim().isEmpty()) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        
        // 清理和验证folderPath
        String normalizedFolderPath;
        if (folderPath == null || folderPath.isEmpty() || folderPath.equals("-") || folderPath.equals("null")) {
            // 无效或空的folderPath，使用根目录
            normalizedFolderPath = "/";
        } else {
            // 确保路径以/开头
            normalizedFolderPath = folderPath.startsWith("/") ? folderPath : "/" + folderPath;
        }

        // 目录层级限制：最多两层目录，根目录不算一层
        // 根目录路径为 "/" (深度0)
        // 一级目录路径如 "/dir1" (深度1)
        // 二级目录路径如 "/dir1/dir2" (深度2)
        // 逻辑：如果 normalizedFolderPath (父目录) 的深度已经达到2，则不允许再创建子目录
        if (!normalizedFolderPath.equals("/")) {
            String[] segments = normalizedFolderPath.substring(1).split("/");
            if (segments.length >= 2) {
                throw new IllegalArgumentException("目录层级超出限制，最多支持两层目录");
            }
        }
        
        // 构建新文件夹的完整路径
        String fullFolderPath;
        if (normalizedFolderPath.equals("/")) {
            // 根目录下创建文件夹
            fullFolderPath = "/" + folderName;
        } else {
            // 子目录下创建文件夹
            fullFolderPath = normalizedFolderPath.endsWith("/") ? normalizedFolderPath + folderName : normalizedFolderPath + "/" + folderName;
        }
        
        // 检查是否已存在同名文件夹
        if (userFolderRepository.existsByUser_IdAndFolderPath(userId, fullFolderPath)) {
            throw new IllegalArgumentException("该文件夹已存在");
        }
        
        UserFolder folder = new UserFolder();
        folder.setUser(user);
        folder.setFolderName(folderName);
        folder.setFolderPath(fullFolderPath);
        
        // 构建父路径
        String parentPath = fullFolderPath.substring(0, fullFolderPath.lastIndexOf('/'));
        if (parentPath.isEmpty()) {
            parentPath = "/";
        }
        folder.setParentPath(parentPath);
        
        folder = userFolderRepository.save(folder);
        
        // 创建物理文件夹
        String physicalPath = getCloudDiskAbsolutePath() + "/" + userId + fullFolderPath;
        new File(physicalPath).mkdirs();
        
        return folder;
    }
    
    /**
     * 删除文件夹
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteFolder(Long userId, Long folderId) throws IOException {
        UserFolder targetFolder = userFolderRepository.findByIdAndUser_Id(folderId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件夹不存在"));
            
        if (targetFolder.getFolderPath().equals("/")) {
            throw new IllegalArgumentException("不能删除根目录");
        }
        
        // 1. 找出所有子文件夹
        String prefix = targetFolder.getFolderPath().endsWith("/") ? targetFolder.getFolderPath() : targetFolder.getFolderPath() + "/";
        List<UserFolder> subFolders = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, prefix);
        
        // 2. 将目标文件夹也加入列表
        List<UserFolder> allFoldersToDelete = new ArrayList<>(subFolders);
        allFoldersToDelete.add(targetFolder);
        
        // 3. 按路径长度倒序排序，确保先删除子文件夹（深层路径更长）
        allFoldersToDelete.sort((f1, f2) -> f2.getFolderPath().length() - f1.getFolderPath().length());
        
        // 4. 依次删除
        for (UserFolder folder : allFoldersToDelete) {
            // 删除文件夹中的所有文件
            List<UserFile> files = userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, folder.getFolderPath());
            for (UserFile file : files) {
                deleteFile(userId, file.getId());
            }
            
            // 删除物理文件夹
            String physicalPath = getCloudDiskAbsolutePath() + "/" + userId + folder.getFolderPath();
            Path path = Paths.get(physicalPath);
            if (Files.exists(path)) {
                // 递归删除物理文件夹（包含可能存在的残留文件）
                try (java.util.stream.Stream<Path> walk = Files.walk(path)) {
                    walk.sorted(java.util.Comparator.reverseOrder())
                        .map(Path::toFile)
                        .forEach(File::delete);
                }
            }
            
            // 删除数据库记录
            userFolderRepository.delete(folder);
        }
    }
    
    /**
     * 上传文件（优化版：使用流式处理，减少内存占用）
     * @param conflictStrategy 冲突处理策略: RENAME (默认), OVERWRITE
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFile uploadFile(Long userId, Long folderId, String folderPath, 
                               MultipartFile file, String conflictStrategy) throws IOException {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));

        // 获取文件大小（不读取文件内容）
        long fileSize = file.getSize();
        
        // 存储配额限制：普通用户最多1GB，管理员无限制
        if (!user.isAdmin()) {
            long usedSize = userFileRepository.sumFileSizeByUserId(userId);
            long limitSize = 1024L * 1024L * 1024L; // 1GB
            if (usedSize + fileSize > limitSize) {
                throw new IllegalArgumentException(
                    String.format("存储空间不足。已使用: %.2f MB，本次上传: %.2f MB，配额: %.2f MB", 
                        usedSize / (1024.0 * 1024.0),
                        fileSize / (1024.0 * 1024.0),
                        limitSize / (1024.0 * 1024.0))
                );
            }
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) originalFilename = "unknown_file";
        
        String saveFolderPath = normalizeFolderPathForDb(folderPath);
        List<String> folderPathCandidates = buildFolderPathCandidates(saveFolderPath);

        String currentFilename = originalFilename;
        Optional<UserFile> existingFileOpt = userFileRepository.findFirstByUser_IdAndFolderPathInAndFilename(
            userId, folderPathCandidates, currentFilename
        );

        if (existingFileOpt.isPresent()) {
            if ("OVERWRITE".equalsIgnoreCase(conflictStrategy)) {
                // 覆盖模式
                UserFile existingFile = existingFileOpt.get();
                
                // 删除旧的物理文件
                String oldRelPath = existingFile.getFilepath();
                String oldPhysicalPath = getCloudDiskAbsolutePath() + "/" + userId + (oldRelPath.startsWith("/") ? oldRelPath : "/" + oldRelPath);
                try { Files.deleteIfExists(Paths.get(oldPhysicalPath)); } catch (Exception ignore) {}
                
                // 保存新物理文件
                String extension = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : "";
                String uniqueFilename = UUID.randomUUID().toString() + extension;
                
                String userDiskPath = getCloudDiskAbsolutePath() + "/" + userId + saveFolderPath;
                Path userDiskPathObj = Paths.get(userDiskPath);
                Files.createDirectories(userDiskPathObj);
                
                String filePath = userDiskPath + "/" + uniqueFilename;
                Path filePathObj = Paths.get(filePath);
                
                // 使用流式复制
                try (java.io.InputStream inputStream = file.getInputStream()) {
                    Files.copy(inputStream, filePathObj, StandardCopyOption.REPLACE_EXISTING);
                }
                
                // 更新记录
                String fileRelPath = saveFolderPath.equals("/") ? ("/" + uniqueFilename) : (saveFolderPath + "/" + uniqueFilename);
                existingFile.setFilepath(fileRelPath);
                existingFile.setFileSize(file.getSize());
                existingFile.setUploadTime(LocalDateTime.now());
                existingFile.setFolderPath(saveFolderPath); // 确保更新folderPath
                
                String mime = file.getContentType();
                if (mime == null || mime.isEmpty()) {
                    mime = FileUtils.getContentType(Paths.get(filePath));
                }
                existingFile.setFileType(mime);
                
                return userFileRepository.save(existingFile);
                
            } else {
                // 智能重命名模式 (默认)
                String nameWithoutExt = originalFilename.contains(".") ? originalFilename.substring(0, originalFilename.lastIndexOf(".")) : originalFilename;
                String ext = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : "";
                
                int counter = 1;
                String newName = originalFilename;
                
                while (true) {
                    String candidate = newName;
                    if (!userFileRepository.existsByUser_IdAndFolderPathInAndFilename(userId, folderPathCandidates, candidate)) break;
                    
                    newName = nameWithoutExt + "(" + counter + ")" + ext;
                    counter++;
                }
                originalFilename = newName;
                // 继续执行下方的保存逻辑，使用新的 originalFilename
            }
        }

        // 生成唯一文件名
        String extension = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : "";
        String uniqueFilename = UUID.randomUUID().toString() + extension;
        
        // 使用流式方式保存物理文件（减少内存占用）
        String userDiskPath = getCloudDiskAbsolutePath() + "/" + userId + saveFolderPath;
        Path userDiskPathObj = Paths.get(userDiskPath);
        Files.createDirectories(userDiskPathObj);
        
        String filePath = userDiskPath + "/" + uniqueFilename;
        Path filePathObj = Paths.get(filePath);
        
        // 使用缓冲流式复制，避免一次性加载整个文件到内存
        try (java.io.InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, filePathObj, StandardCopyOption.REPLACE_EXISTING);
        }
        
        UserFile userFile = new UserFile();
        userFile.setUser(user);
        userFile.setFilename(originalFilename);
        userFile.setOriginalFilename(originalFilename);
        String fileRelPath = saveFolderPath.equals("/") ? ("/" + uniqueFilename) : (saveFolderPath + "/" + uniqueFilename);
        userFile.setFilepath(fileRelPath);
        userFile.setFolderPath(saveFolderPath); // 显式设置 folderPath

        userFile.setFileSize(file.getSize());
        String contentType = file.getContentType();
        if (contentType == null || contentType.isEmpty()) {
            contentType = FileUtils.getContentType(Paths.get(filePath));
        }
        if (contentType != null) {
            int semi = contentType.indexOf(';');
            if (semi > 0) {
                contentType = contentType.substring(0, semi).trim();
            }
            if (contentType.length() > 50) {
                contentType = contentType.substring(0, 50);
            }
        }
        userFile.setFileType(contentType);
        userFile.setFolderPath(saveFolderPath);
        return userFileRepository.save(userFile);
    }
    
    /**
     * 获取用户的所有文件
     */
    public List<UserFile> getUserFiles(Long userId, Long folderId, String folderPath) {
        if (folderId != null) {
            UserFolder folder = userFolderRepository.findByIdAndUser_Id(folderId, userId)
                .orElseThrow(() -> new IllegalArgumentException("文件夹不存在"));
            return userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, folder.getFolderPath());
        } else if (folderPath != null) {
            return userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, normalizeFolderPathForDb(folderPath));
        }
        return userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
    }

    @Transactional(rollbackFor = Exception.class)
    public UserFile renameFile(Long userId, Long fileId, String newName) {
        if (newName == null || newName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件名称不能为空");
        }
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        String folderPath = file.getFolderPath();
        List<String> folderPathCandidates = buildFolderPathCandidates(folderPath);
        boolean exists = userFileRepository.existsByUser_IdAndFolderPathInAndFilenameIgnoreCaseAndIdNot(
            userId, folderPathCandidates, newName.trim(), file.getId()
        );
        if (exists) {
            String rel = file.getFilepath();
            String unique = rel != null && rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
            String base = getCloudDiskAbsolutePath() + "/" + userId;
            java.nio.file.Path tempDir = java.nio.file.Paths.get(base + "/__temp").normalize();
            try { java.nio.file.Files.createDirectories(tempDir); } catch (Exception ignore) {}
            java.nio.file.Path oldPath = java.nio.file.Paths.get(base + (rel != null && rel.startsWith("/") ? rel : ("/" + rel))).normalize();
            java.nio.file.Path tempPath = tempDir.resolve(unique == null ? java.util.UUID.randomUUID().toString() : unique).normalize();
            try { java.nio.file.Files.move(oldPath, tempPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING); } catch (Exception ignore) {}
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("conflict", true);
            payload.put("tempRelPath", "/__temp/" + (unique == null ? tempPath.getFileName().toString() : unique));
            payload.put("originalRelPath", rel);
            payload.put("originalFolderPath", folderPath);
            payload.put("desiredName", newName.trim());
            payload.put("fileId", file.getId());
            throw new RuntimeException("RENAME_CONFLICT:" + new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(payload).toString());
        }
        file.setFilename(newName.trim());
        return userFileRepository.save(file);
    }

    @Transactional(rollbackFor = Exception.class)
    public java.util.Map<String, Object> startRenameFolder(Long userId, Long folderId, String newName) throws IOException {
        if (newName == null || newName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件夹名称不能为空");
        }
        UserFolder folder = userFolderRepository.findByIdAndUser_Id(folderId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件夹不存在"));
        
        String oldPath = folder.getFolderPath();
        String parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        if (parentPath.isEmpty()) parentPath = "/";
        String targetPath = (parentPath.equals("/") ? "/" : parentPath + "/") + newName.trim();
        
        boolean exists = userFolderRepository.existsByUser_IdAndFolderPath(userId, targetPath);
        
        if (!exists) {
            renameFolder(userId, folderId, newName.trim());
            java.util.Map<String, Object> ok = new java.util.HashMap<>();
            ok.put("conflict", false);
            ok.put("folder", userFolderRepository.findById(folderId).orElse(folder));
            return ok;
        }
        
        java.util.Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("conflict", true);
        payload.put("folderId", folderId);
        payload.put("originalName", folder.getFolderName());
        payload.put("desiredName", newName.trim());
        return payload;
    }

    @Transactional(rollbackFor = Exception.class)
    public UserFolder resolveRenameFolder(Long userId, Long folderId, String action, String finalName) throws IOException {
        if (finalName == null || finalName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件夹名称不能为空");
        }
        UserFolder folder = userFolderRepository.findByIdAndUser_Id(folderId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件夹不存在"));
            
        String oldPath = folder.getFolderPath();
        String parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        if (parentPath.isEmpty()) parentPath = "/";
        
        if ("override".equalsIgnoreCase(action)) {
            // 合并模式：将源文件夹的内容移动到目标文件夹，然后删除源文件夹
            String targetPath = (parentPath.equals("/") ? "/" : parentPath + "/") + finalName.trim();
            UserFolder targetFolder = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, targetPath)
                .stream().filter(f -> f.getFolderPath().equals(targetPath)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("目标文件夹不存在，无法合并"));
            
            // 移动源文件夹下的所有内容到目标文件夹
            String sourcePrefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
            String targetPrefix = targetPath.endsWith("/") ? targetPath : targetPath + "/";
            
            // 1. 移动子文件夹
            // 排序以确保先处理父级？其实只需要更新路径即可
            // 注意：如果目标文件夹下也有同名子文件夹，这里会产生深层冲突。
            // 简化处理：如果目标存在同名子文件夹，则再次递归合并？
            // 由于递归复杂，这里采用“遇到同名子文件夹则自动重命名子文件夹”的策略，或者简单地更新路径（这可能导致数据库中同一路径有多个记录，这是错误的）。
            // 正确做法：对每个子项，检查目标是否存在。
            
            // 物理移动：整个目录移动是不行的，因为目标已存在。需要逐个移动。
            String base = getCloudDiskAbsolutePath() + "/" + userId;
            java.nio.file.Path sourceDir = java.nio.file.Paths.get(base + sourcePrefix).normalize();
            java.nio.file.Path targetDir = java.nio.file.Paths.get(base + targetPrefix).normalize();
            
            // 遍历源目录下的文件和文件夹
            if (Files.exists(sourceDir)) {
                try (java.util.stream.Stream<Path> stream = Files.list(sourceDir)) {
                    java.util.Iterator<Path> it = stream.iterator();
                    while (it.hasNext()) {
                        Path sourceChild = it.next();
                        Path targetChild = targetDir.resolve(sourceChild.getFileName());
                        if (Files.exists(targetChild)) {
                            // 冲突：如果是文件，覆盖；如果是文件夹，合并（递归？太复杂，这里简化为：如果目标是文件夹，源也是文件夹，则不移动源文件夹本身，而是进入下一层？
                            // 简化策略：对于文件冲突，直接覆盖。对于文件夹冲突，保留源文件夹内容（不移动），或者报错。
                            // 但用户要求“覆盖将合并”。
                            // 使用 Java 的 walkFileTree 来移动/合并
                             mergeDirectories(sourceChild, targetChild);
                        } else {
                            Files.move(sourceChild, targetChild, StandardCopyOption.REPLACE_EXISTING);
                        }
                    }
                }
                // 移完内容后删除源空目录
                Files.deleteIfExists(sourceDir);
            }
            
            // 数据库更新：
            // 这种物理合并会导致数据库路径与物理路径不一致，必须更新数据库。
            // 对于被移动的文件/文件夹，需要更新它们的 folderPath。
            // 既然物理上已经合并了，数据库中应该把 oldPath 下的所有东西 update 到 targetPath 下。
            // 如果 targetPath 下已有同名项？
            // 比如 oldPath/sub -> targetPath/sub. 如果 targetPath/sub 已存在，那么数据库里会有两个 targetPath/sub 记录。
            // 这是不允许的（通常逻辑不允许）。
            // 所以数据库层面也需要“合并”。
            
            // 重新扫描目标文件夹可能是最简单的恢复数据库一致性的方法，但我们不能依赖它。
            // 手动更新：
            // 找出 oldPath 下的所有直接子文件和子文件夹。
            // 对于每个子文件：检查 targetPath 下是否有同名文件。有则删除旧记录（被覆盖），更新新记录？不对，物理上是覆盖，所以数据库保留 source 的记录更新路径，删除 target 的记录。
            
            // 更新文件记录
            List<UserFile> sourceFiles = userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, oldPath);
            for (UserFile f : sourceFiles) {
                // 检查目标是否存在
                Optional<UserFile> existing = userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, targetPath).stream()
                    .filter(tf -> tf.getFilename().equals(f.getFilename())).findFirst();
                if (existing.isPresent()) {
                    userFileRepository.delete(existing.get()); // 删除被覆盖的目标文件记录
                }
                f.setFolderPath(targetPath);
                // filepath 也需要更新
                String fileName = f.getFilename();
                String newRel = (targetPath.endsWith("/") ? targetPath : targetPath + "/") + fileName; // /target/a.txt
                f.setFilepath(newRel);
                userFileRepository.save(f);
            }
            
            // 更新子文件夹记录
            // 这是一个难点。简单的做法是：如果目标存在同名子文件夹，则把源子文件夹下的内容移到目标子文件夹下，然后删除源子文件夹记录。
            // 递归处理数据库记录
            mergeFolderRecords(userId, oldPath, targetPath);
            
            // 最后删除源文件夹记录
            userFolderRepository.delete(folder);
            
            return targetFolder;
            
        } else {
            // 智能重命名
            String targetPath = (parentPath.equals("/") ? "/" : parentPath + "/") + finalName.trim();
            boolean exists = userFolderRepository.existsByUser_IdAndFolderPath(userId, targetPath);
            String actualName = finalName.trim();
            if (exists) {
                int i = 1;
                while (true) {
                    String candidate = finalName.trim() + "(" + i + ")";
                    String candidatePath = (parentPath.equals("/") ? "/" : parentPath + "/") + candidate;
                    if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, candidatePath)) {
                        actualName = candidate;
                        break;
                    }
                    i++;
                }
            }
            return renameFolder(userId, folderId, actualName);
        }
    }
    
    private void mergeDirectories(Path source, Path target) throws IOException {
        if (Files.isDirectory(source)) {
            if (!Files.exists(target)) {
                Files.createDirectories(target);
            }
            try (java.util.stream.Stream<Path> stream = Files.list(source)) {
                for (Path child : stream.toList()) {
                    mergeDirectories(child, target.resolve(child.getFileName()));
                }
            }
            Files.deleteIfExists(source);
        } else {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
    
    private void mergeFolderRecords(Long userId, String sourcePath, String targetPath) {
        // 处理直接子文件夹
        // 这里的 findBy... 会返回所有后代，我们需要过滤出直接子级
        // 或者简单点，递归。
        
        // 查找 sourcePath 的直接子文件夹
        // 由于 JPA 没有直接查直接子级的方法，我们用 startWith 过滤
        String sourcePrefix = sourcePath.endsWith("/") ? sourcePath : sourcePath + "/";
        
        // 获取所有源后代文件夹
        List<UserFolder> allSourceDescendants = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, sourcePrefix);
        
        // 按层级深度排序（深的先处理？不，浅的先处理）
        // 其实只需要处理直接子级，因为递归会处理更深层
        // 但为了避免多次查询，我们可以遍历。
        
        // 更好策略：找出所有直接子文件夹
        List<UserFolder> directChildren = allSourceDescendants.stream()
            .filter(f -> {
                String p = f.getFolderPath();
                String parent = p.substring(0, p.lastIndexOf('/'));
                if (parent.isEmpty()) parent = "/";
                return parent.equals(sourcePath);
            }).toList();
            
        for (UserFolder child : directChildren) {
            String childName = child.getFolderName();
            String newChildPath = (targetPath.endsWith("/") ? targetPath : targetPath + "/") + childName;
            
            // 检查目标是否存在同名文件夹
            Optional<UserFolder> targetChildOpt = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, newChildPath)
                .stream().filter(f -> f.getFolderPath().equals(newChildPath)).findFirst();
                
            if (targetChildOpt.isPresent()) {
                // 目标存在，递归合并
                mergeFolderRecords(userId, child.getFolderPath(), newChildPath);
                // 合并完内容后，删除源子文件夹记录
                userFolderRepository.delete(child);
            } else {
                // 目标不存在，直接更新路径（及其所有后代路径）
                updateFolderPathRecursive(userId, child, newChildPath);
            }
        }
        
        // 处理文件（已经在上层处理了？不对，这里是递归调用，需要处理当前 sourcePath 下的文件）
        // 注意：resolveRenameFolder 中已经处理了顶层的文件。
        // 但对于递归调用的 mergeFolderRecords，也需要处理文件。
        List<UserFile> files = userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, sourcePath);
        for (UserFile f : files) {
             Optional<UserFile> existing = userFileRepository.findByUser_IdAndFolderPathOrderByUploadTimeDesc(userId, targetPath).stream()
                .filter(tf -> tf.getFilename().equals(f.getFilename())).findFirst();
            if (existing.isPresent()) {
                userFileRepository.delete(existing.get());
            }
            f.setFolderPath(targetPath);
            String fileName = f.getFilename();
            String newRel = (targetPath.endsWith("/") ? targetPath : targetPath + "/") + fileName;
            f.setFilepath(newRel);
            userFileRepository.save(f);
        }
    }
    
    private void updateFolderPathRecursive(Long userId, UserFolder folder, String newPath) {
        String oldPath = folder.getFolderPath();
        String oldPrefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
        String newPrefix = newPath.endsWith("/") ? newPath : newPath + "/";
        
        folder.setFolderPath(newPath);
        String parent = newPath.substring(0, newPath.lastIndexOf('/'));
        if (parent.isEmpty()) parent = "/";
        folder.setParentPath(parent);
        userFolderRepository.save(folder);
        
        // 更新后代文件夹
        List<UserFolder> descendants = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, oldPrefix);
        for (UserFolder sub : descendants) {
            String subOldPath = sub.getFolderPath();
            String subNewPath = newPrefix + subOldPath.substring(oldPrefix.length());
            sub.setFolderPath(subNewPath);
            String subParent = subNewPath.substring(0, subNewPath.lastIndexOf('/'));
            if (subParent.isEmpty()) subParent = "/";
            sub.setParentPath(subParent);
            userFolderRepository.save(sub);
        }
        
        // 更新后代文件
        List<UserFile> allFiles = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId); // 优化：应该用 SQL 查
        for (UserFile f : allFiles) {
            String fp = f.getFolderPath();
            if (fp != null && (fp.equals(oldPath) || fp.startsWith(oldPrefix))) {
                String newFP;
                if (fp.equals(oldPath)) newFP = newPath;
                else newFP = newPrefix + fp.substring(oldPrefix.length());
                
                f.setFolderPath(newFP);
                String rel = f.getFilepath();
                if (rel != null) {
                   int idx = rel.lastIndexOf('/');
                   String fname = idx >= 0 ? rel.substring(idx + 1) : rel;
                   f.setFilepath((newFP.endsWith("/") ? newFP : newFP + "/") + fname);
                }
                userFileRepository.save(f);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public java.util.Map<String, Object> startRenameFile(Long userId, Long fileId, String newName) throws IOException {
        if (newName == null || newName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件名称不能为空");
        }
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        String folderPath = file.getFolderPath();
        List<UserFile> siblings = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
        boolean exists = siblings.stream().anyMatch(f -> {
            boolean sameFolder = normalizePath(f.getFolderPath()).equals(normalizePath(folderPath));
            String a = f.getFilename() != null ? f.getFilename().trim() : "";
            String b = newName.trim();
            boolean sameName = a.equalsIgnoreCase(b);
            return sameFolder && sameName && !f.getId().equals(file.getId());
        });
        if (!exists) {
            file.setFilename(newName.trim());
            UserFile saved = userFileRepository.save(file);
            java.util.Map<String, Object> ok = new java.util.HashMap<>();
            ok.put("conflict", false);
            ok.put("file", saved);
            return ok;
        }
        String rel = file.getFilepath();
        String unique = rel != null && rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
        String base = getCloudDiskAbsolutePath() + "/" + userId;
        java.nio.file.Path tempDir = java.nio.file.Paths.get(base + "/__temp").normalize();
        Files.createDirectories(tempDir);
        java.nio.file.Path oldPath = java.nio.file.Paths.get(base + (rel != null && rel.startsWith("/") ? rel : ("/" + rel))).normalize();
        java.nio.file.Path tempPath = tempDir.resolve(unique == null ? java.util.UUID.randomUUID().toString() : unique).normalize();
        Files.move(oldPath, tempPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        java.util.Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("conflict", true);
        payload.put("tempRelPath", "/__temp/" + (unique == null ? tempPath.getFileName().toString() : unique));
        payload.put("originalRelPath", rel);
        payload.put("originalFolderPath", folderPath);
        payload.put("desiredName", newName.trim());
        payload.put("fileId", file.getId());
        return payload;
    }

    @Transactional(rollbackFor = Exception.class)
    public UserFile resolveRenameFile(Long userId, Long fileId, String action, String finalName) throws java.io.IOException {
        if (finalName == null || finalName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件名称不能为空");
        }
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        String folderPath = file.getFolderPath();
        String rel = file.getFilepath();
        String unique = rel != null && rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
        String base = getCloudDiskAbsolutePath() + "/" + userId;
        java.nio.file.Path tempPath = java.nio.file.Paths.get(base + "/__temp/" + unique).normalize();
        java.nio.file.Path targetDir = java.nio.file.Paths.get(base + (folderPath != null && folderPath.startsWith("/") ? folderPath : ("/" + folderPath))).normalize();
        Files.createDirectories(targetDir);

        if ("override".equalsIgnoreCase(action)) {
            List<UserFile> all = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
            for (UserFile other : all) {
                boolean sameFolder = normalizePath(other.getFolderPath()).equals(normalizePath(folderPath));
                boolean sameName = (other.getFilename() != null ? other.getFilename().trim() : "").equals(finalName.trim());
                if (sameFolder && sameName && !other.getId().equals(file.getId())) {
                    String orel = other.getFilepath();
                    java.nio.file.Path oPath = java.nio.file.Paths.get(base + (orel != null && orel.startsWith("/") ? orel : ("/" + orel))).normalize();
                    if (java.nio.file.Files.exists(oPath)) java.nio.file.Files.delete(oPath);
                    userFileRepository.delete(other);
                    break;
                }
            }
        } else {
            List<UserFile> all = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
            String baseName = finalName.trim();
            boolean exists = all.stream().anyMatch(f -> {
                boolean sameFolder = normalizePath(f.getFolderPath()).equals(normalizePath(folderPath));
                String a = f.getFilename() != null ? f.getFilename().trim() : "";
                boolean sameName = a.equalsIgnoreCase(baseName);
                return sameFolder && sameName && !f.getId().equals(file.getId());
            });
            if (exists) {
                String name = baseName;
                int i = 1;
                while (true) {
                    String candidate = baseName + i;
                    boolean ok = all.stream().noneMatch(f -> {
                        boolean sameFolder = normalizePath(f.getFolderPath()).equals(normalizePath(folderPath));
                        String a = f.getFilename() != null ? f.getFilename().trim() : "";
                        boolean sameName = a.equalsIgnoreCase(candidate);
                        return sameFolder && sameName && !f.getId().equals(file.getId());
                    });
                    if (ok) { name = candidate; break; }
                    i++;
                }
                finalName = name;
            }
        }

        java.nio.file.Path targetPath = targetDir.resolve(unique).normalize();
        if (java.nio.file.Files.exists(tempPath)) java.nio.file.Files.move(tempPath, targetPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        file.setFilename(finalName.trim());
        return userFileRepository.save(file);
    }
    
    /**
     * 获取文件内容
     * @param userId 用户ID
     * @param fileId 文件ID
     * @return 文件文本内容
     */
    public String getFileContent(Long userId, Long fileId) throws IOException {
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
            
        String relPath = file.getFilepath();
        Path physicalPath = Paths.get(getCloudDiskAbsolutePath(), String.valueOf(userId), 
            relPath.startsWith("/") ? relPath.substring(1) : relPath).normalize();
            
        if (!Files.exists(physicalPath)) {
            throw new IOException("物理文件不存在");
        }
        
        return readFileWithEncodingDetection(physicalPath);
    }

    /**
     * 更新文件内容
     * @param userId 用户ID
     * @param fileId 文件ID
     * @param content 新内容
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateFileContent(Long userId, Long fileId, String content) throws IOException {
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
            
        String relPath = file.getFilepath();
        Path physicalPath = Paths.get(getCloudDiskAbsolutePath(), String.valueOf(userId), 
            relPath.startsWith("/") ? relPath.substring(1) : relPath).normalize();
            
        // 确保父目录存在
        Files.createDirectories(physicalPath.getParent());
        
        // 写入新内容
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        Files.write(physicalPath, bytes);
        
        // 更新数据库中的文件大小和修改时间
        file.setFileSize((long) bytes.length);
        file.setUploadTime(LocalDateTime.now());
        userFileRepository.save(file);
    }

    /**
     * 管理员获取文件内容（不限制用户ID）
     * @param fileId 文件ID
     * @return 文件文本内容
     */
    public String getFileContentAdmin(Long fileId) throws IOException {
        UserFile file = userFileRepository.findById(fileId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
            
        String relPath = file.getFilepath();
        Path physicalPath = Paths.get(getCloudDiskAbsolutePath(), String.valueOf(file.getUser().getId()), 
            relPath.startsWith("/") ? relPath.substring(1) : relPath).normalize();
            
        if (!Files.exists(physicalPath)) {
            throw new IOException("物理文件不存在");
        }
        
        return readFileWithEncodingDetection(physicalPath);
    }

    /**
     * 带编码检测的文件读取（优化：限制大文件读取，避免内存溢出）
     * @param path 文件路径
     * @return 文件内容
     */
    private String readFileWithEncodingDetection(Path path) throws IOException {
        // 检查文件大小，防止读取过大文件导致内存问题
        long fileSize = Files.size(path);
        if (fileSize > 50 * 1024 * 1024) { // 限制50MB
            throw new IOException("文件过大，无法直接读取。文件大小: " + 
                String.format("%.2f MB", fileSize / (1024.0 * 1024.0)));
        }
        
        byte[] bytes = Files.readAllBytes(path);
        if (bytes.length == 0) return "";

        // 1. 检查 BOM
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        } else if (bytes.length >= 2 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xFE) {
            return new String(bytes, 2, bytes.length - 2, java.nio.charset.Charset.forName("UTF-16LE"));
        } else if (bytes.length >= 2 && (bytes[0] & 0xFF) == 0xFE && (bytes[1] & 0xFF) == 0xFF) {
            return new String(bytes, 2, bytes.length - 2, java.nio.charset.Charset.forName("UTF-16BE"));
        }

        // 2. 尝试 UTF-8
        try {
            java.nio.charset.CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder();
            decoder.onMalformedInput(java.nio.charset.CodingErrorAction.REPORT);
            return decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (java.nio.charset.CharacterCodingException e) {
            // 3. 尝试 GBK
            try {
                java.nio.charset.Charset gbk = java.nio.charset.Charset.forName("GBK");
                java.nio.charset.CharsetDecoder gbkDecoder = gbk.newDecoder();
                gbkDecoder.onMalformedInput(java.nio.charset.CodingErrorAction.REPORT);
                return gbkDecoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
            } catch (Exception e2) {
                // 4. 尝试 UTF-16LE (无 BOM)
                try {
                    if (bytes.length % 2 == 0) {
                        java.nio.charset.Charset utf16le = java.nio.charset.Charset.forName("UTF-16LE");
                        java.nio.charset.CharsetDecoder utf16Decoder = utf16le.newDecoder();
                        utf16Decoder.onMalformedInput(java.nio.charset.CodingErrorAction.REPORT);
                        return utf16Decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
                    }
                } catch (Exception e3) {
                    // Ignore
                }
                // 5. 强制 UTF-8 降级
                return new String(bytes, StandardCharsets.UTF_8);
            }
        }
    }

    /**
     * 管理员更新文件内容（不限制用户ID）
     * @param fileId 文件ID
     * @param content 新内容
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateFileContentAdmin(Long fileId, String content) throws IOException {
        UserFile file = userFileRepository.findById(fileId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
            
        String relPath = file.getFilepath();
        Path physicalPath = Paths.get(getCloudDiskAbsolutePath(), String.valueOf(file.getUser().getId()), 
            relPath.startsWith("/") ? relPath.substring(1) : relPath).normalize();
            
        // 确保父目录存在
        Files.createDirectories(physicalPath.getParent());
        
        // 写入新内容
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        Files.write(physicalPath, bytes);
        
        // 更新数据库中的文件大小和修改时间
        file.setFileSize((long) bytes.length);
        file.setUploadTime(LocalDateTime.now());
        userFileRepository.save(file);
    }

    /**
     * 下载文件 (管理员权限)
     */
    @Transactional(readOnly = true)
    public Path downloadFileAdmin(Long fileId) throws IOException {
        UserFile file = userFileRepository.findByIdWithUser(fileId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在: " + fileId));
        Long userId = file.getUser().getId();
        
        String rel = file.getFilepath();
        if (rel == null) {
            throw new IOException("文件路径为空: " + fileId);
        }
        
        // 去掉开头的斜杠以进行 resolve
        String relNorm = rel.startsWith("/") ? rel.substring(1) : rel;
        
        // 使用 Path.resolve 进行稳健的路径拼接
        Path base = Paths.get(getCloudDiskAbsolutePath()).normalize();
        Path userBase = base.resolve(String.valueOf(userId)).normalize();
        Path filePath = userBase.resolve(relNorm).normalize();
        
        log.info("Admin download resolution attempt 1: userId={}, rel={}, resolved={}", userId, rel, filePath);

        // 如果路径不存在，尝试去掉 relNorm 中的 userId 前缀（如果存在）
        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            String userIdStr = String.valueOf(userId);
            if (relNorm.startsWith(userIdStr + "/")) {
                String subRel = relNorm.substring(userIdStr.length() + 1);
                Path altPath = userBase.resolve(subRel).normalize();
                log.info("Admin download resolution attempt 2 (stripped userId): {}", altPath);
                if (Files.exists(altPath) && Files.isRegularFile(altPath)) {
                    return altPath;
                }
            }
            
            // 尝试直接在 base 下 resolve (如果 relNorm 已经包含 userId)
            Path directPath = base.resolve(relNorm).normalize();
            log.info("Admin download resolution attempt 3 (direct from base): {}", directPath);
            if (Files.exists(directPath) && Files.isRegularFile(directPath)) {
                return directPath;
            }

            // 尝试 base + userId + relNorm (处理可能缺失斜杠导致的合并路径, 如 215.翻译)
            Path mergedPath = base.resolve(userId + relNorm).normalize();
            log.info("Admin download resolution attempt 4 (merged userId+rel): {}", mergedPath);
            if (Files.exists(mergedPath) && Files.isRegularFile(mergedPath)) {
                return mergedPath;
            }

            throw new IOException("物理文件不存在。已尝试路径: " + filePath + ", " + directPath + ", " + mergedPath);
        }
        return filePath;
    }

    /**
     * 下载文件
     */
    public Path downloadFile(Long userId, Long fileId) throws IOException {
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        ensureUserDirectoryExists(userId);
        String rel = file.getFilepath();
        String relNorm = (rel != null && rel.startsWith("/")) ? rel.substring(1) : rel;
        Path cwd = Paths.get(System.getProperty("user.dir")).normalize();
        Path p1 = cwd.resolve("cloud_disk").resolve(String.valueOf(userId)).resolve(relNorm == null ? "" : relNorm).normalize();
        Path p2 = cwd.getParent() != null ? cwd.getParent().resolve("cloud_disk").resolve(String.valueOf(userId)).resolve(relNorm == null ? "" : relNorm).normalize() : p1;
        Path p3 = (cwd.getParent() != null && cwd.getParent().getParent() != null) ? cwd.getParent().getParent().resolve("cloud_disk").resolve(String.valueOf(userId)).resolve(relNorm == null ? "" : relNorm).normalize() : p2;
        Path chosen = Files.exists(p1) ? p1 : (Files.exists(p2) ? p2 : p3);
        if (!Files.exists(chosen) || !Files.isRegularFile(chosen)) {
            String physicalPath = getCloudDiskAbsolutePath() + "/" + userId + (rel != null && rel.startsWith("/") ? rel : ("/" + rel));
            Path fallback = Paths.get(physicalPath).normalize();
            if (!Files.exists(fallback) || !Files.isRegularFile(fallback)) {
                throw new IOException("文件不存在或已被删除: " + fallback);
            }
            return fallback;
        }
        return chosen;
    }
    
    /**
     * 删除文件
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteFile(Long userId, Long fileId) throws IOException {
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        
        // 删除物理文件
        String relDel = file.getFilepath();
        String physicalPath = getCloudDiskAbsolutePath() + "/" + userId + (relDel != null && relDel.startsWith("/") ? relDel : ("/" + relDel));
        Path path = Paths.get(physicalPath);
        if (Files.exists(path)) {
            Files.delete(path);
        }
        
        // 删除数据库记录
        userFileRepository.delete(file);
    }
    
    /**
     * 移动文件
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFile moveFile(Long userId, Long fileId, Long targetFolderId, String targetPath) throws IOException {
        UserFile file = userFileRepository.findByIdAndUserId(fileId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件不存在"));
        
        String oldRel = file.getFilepath();
        String oldPhysicalPath = getCloudDiskAbsolutePath() + "/" + userId + (oldRel != null && oldRel.startsWith("/") ? oldRel : ("/" + oldRel));
        String filename = file.getFilepath().substring(file.getFilepath().lastIndexOf("/") + 1);
        String newFilePath = (targetPath != null && targetPath.endsWith("/")) ? (targetPath + filename) : (targetPath + "/" + filename);
        String newPhysicalPath = getCloudDiskAbsolutePath() + "/" + userId + (newFilePath.startsWith("/") ? newFilePath : ("/" + newFilePath));
        try { Files.createDirectories(Paths.get(newPhysicalPath).normalize().getParent()); } catch (Exception ignore) {}
        
        // 移动物理文件
        Files.move(Paths.get(oldPhysicalPath), Paths.get(newPhysicalPath), StandardCopyOption.REPLACE_EXISTING);
        
        // 更新数据库记录
        file.setFolderPath(targetPath);
        file.setFilepath(newFilePath);
        
        return userFileRepository.save(file);
    }

    public Path zipFolder(Long userId, String folderPath) throws IOException {
        ensureUserDirectoryExists(userId);
        String base = getCloudDiskAbsolutePath() + "/" + userId;
        String rel = (folderPath != null && !folderPath.isEmpty()) ? (folderPath.startsWith("/") ? folderPath : "/" + folderPath) : "";
        Path start = Paths.get(base + (rel.isEmpty() ? "" : rel)).normalize();
        if (!Files.exists(start) || !Files.isDirectory(start)) {
            throw new IOException("目录不存在: " + start);
        }
        Path tempZip = Files.createTempFile("cloud-folder-" + userId + "-", ".zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(tempZip))) {
            Path root = start;
            Files.walk(root).forEach(p -> {
                String entryName = root.relativize(p).toString().replace("\\", "/");
                try {
                    if (Files.isDirectory(p)) {
                        if (!entryName.isEmpty()) {
                            if (!entryName.endsWith("/")) {
                                entryName = entryName + "/";
                            }
                            zos.putNextEntry(new ZipEntry(entryName));
                            zos.closeEntry();
                        }
                    } else {
                        zos.putNextEntry(new ZipEntry(entryName));
                        Files.copy(p, zos);
                        zos.closeEntry();
                    }
                } catch (IOException e) {
                }
            });
        }
        tempZip.toFile().deleteOnExit();
        return tempZip;
    }

    /**
     * 上传并解压文件夹
     */
    @Transactional(rollbackFor = Exception.class)
    public int uploadFolderZip(Long userId, String folderPath, MultipartFile zipFile) throws IOException {
        ensureUserDirectoryExists(userId);
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));

        String base = getCloudDiskAbsolutePath() + "/" + userId;
        String normParam = (folderPath != null && !folderPath.isEmpty()) ? (folderPath.startsWith("/") ? folderPath : "/" + folderPath) : "/";
        Path targetBase = Paths.get(base + (normParam.equals("/") ? "" : normParam)).normalize();
        try { Files.createDirectories(targetBase); } catch (Exception ignore) {}

        // 确保目标文件夹在数据库中存在
        if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, normParam)) {
            String name = normParam.equals("/") ? "根目录" : normParam.substring(normParam.lastIndexOf('/') + 1);
            UserFolder f = new UserFolder();
            f.setUser(user);
            f.setFolderName(name);
            f.setFolderPath(normParam);
            String parentPath = normParam.equals("/") ? null : normParam.substring(0, normParam.lastIndexOf('/')).isEmpty() ? "/" : normParam.substring(0, normParam.lastIndexOf('/'));
            f.setParentPath(parentPath);
            userFolderRepository.save(f);
        }

        int count = 0;
        try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(zipFile.getInputStream())) {
            java.util.zip.ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName().replace("\\", "/");
                if (entry.isDirectory()) {
                    Path dir = targetBase.resolve(entryName).normalize();
                    try { Files.createDirectories(dir); } catch (Exception ignore) {}
                    String fullFolderPath = normParam.equals("/") ? "/" + entryName.replaceAll("/+", "/").replaceAll("/$", "") : (normParam + (normParam.endsWith("/") ? "" : "/") + entryName.replaceAll("/+", "/").replaceAll("/$", ""));
                    if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, fullFolderPath)) {
                        UserFolder sub = new UserFolder();
                        sub.setUser(user);
                        String folderName = entryName.replaceAll("/$", "");
                        folderName = folderName.contains("/") ? folderName.substring(folderName.lastIndexOf('/') + 1) : folderName;
                        sub.setFolderName(folderName);
                        sub.setFolderPath(fullFolderPath);
                        String parentPath = fullFolderPath.substring(0, fullFolderPath.lastIndexOf('/'));
                        if (parentPath.isEmpty()) parentPath = "/";
                        sub.setParentPath(parentPath);
                        userFolderRepository.save(sub);
                    }
                } else {
                    Path targetDir = targetBase.resolve(entryName).normalize().getParent();
                    if (targetDir != null) {
                        try { Files.createDirectories(targetDir); } catch (Exception ignore) {}
                    }
                    String originalFilename = entryName.contains("/") ? entryName.substring(entryName.lastIndexOf('/') + 1) : entryName;
                    String extension = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf('.')) : "";
                    String uniqueFilename = java.util.UUID.randomUUID().toString() + (extension.isEmpty() ? "" : extension);
                    Path physicalTarget = (targetDir == null ? targetBase : targetDir).resolve(uniqueFilename).normalize();
                    Files.copy(zis, physicalTarget, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

                    String relDir = entryName.contains("/") ? entryName.substring(0, entryName.lastIndexOf('/')) : "";
                    String fullFolderPath = normParam.equals("/") ? (relDir.isEmpty() ? "/" : "/" + relDir) : (normParam + (normParam.endsWith("/") ? "" : "/") + relDir);
                    fullFolderPath = fullFolderPath.replaceAll("/+", "/");
                    if (!fullFolderPath.startsWith("/")) fullFolderPath = "/" + fullFolderPath;
                    if (fullFolderPath.endsWith("/")) fullFolderPath = fullFolderPath.substring(0, fullFolderPath.length() - 1);
                    if (fullFolderPath.isEmpty()) fullFolderPath = "/";

                    if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, fullFolderPath)) {
                        UserFolder sub = new UserFolder();
                        sub.setUser(user);
                        String folderName = fullFolderPath.substring(fullFolderPath.lastIndexOf('/') + 1);
                        sub.setFolderName(folderName.isEmpty() ? "根目录" : folderName);
                        sub.setFolderPath(fullFolderPath);
                        String parentPath = fullFolderPath.substring(0, fullFolderPath.lastIndexOf('/'));
                        if (parentPath.isEmpty()) parentPath = "/";
                        sub.setParentPath(parentPath);
                        userFolderRepository.save(sub);
                    }

                    UserFile uf = new UserFile();
                    uf.setUser(user);
                    uf.setFilename(originalFilename);
                    uf.setOriginalFilename(originalFilename);
                    String relFilePath = fullFolderPath.endsWith("/") ? (fullFolderPath + uniqueFilename) : (fullFolderPath + "/" + uniqueFilename);
                    uf.setFilepath(relFilePath);
                    try { uf.setFileSize(Files.size(physicalTarget)); } catch (Exception e) { uf.setFileSize(0L); }
                    String mime = FileUtils.getContentType(physicalTarget);
                    if (mime != null) {
                        int semi = mime.indexOf(';');
                        if (semi > 0) mime = mime.substring(0, semi).trim();
                        if (mime.length() > 50) mime = mime.substring(0, 50);
                    }
                    uf.setFileType(mime);
                    uf.setFolderPath(fullFolderPath);
                    userFileRepository.save(uf);
                    count++;
                }
                zis.closeEntry();
            }
        }
        return count;
    }

    @Transactional
    public int uploadFolderStream(Long userId, String folderPath, MultipartFile[] files, String[] paths) throws IOException {
        ensureUserDirectoryExists(userId);
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        String base = getCloudDiskAbsolutePath() + "/" + userId;
        String normParam = (folderPath != null && !folderPath.isEmpty()) ? (folderPath.startsWith("/") ? folderPath : "/" + folderPath) : "/";
        Path targetBase = Paths.get(base + (normParam.equals("/") ? "" : normParam)).normalize();
        try { Files.createDirectories(targetBase); } catch (Exception ignore) {}

        if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, normParam)) {
            String name = normParam.equals("/") ? "根目录" : normParam.substring(normParam.lastIndexOf('/') + 1);
            UserFolder f = new UserFolder();
            f.setUser(user);
            f.setFolderName(name);
            f.setFolderPath(normParam);
            String parentPath = normParam.equals("/") ? null : normParam.substring(0, normParam.lastIndexOf('/')).isEmpty() ? "/" : normParam.substring(0, normParam.lastIndexOf('/'));
            f.setParentPath(parentPath);
            userFolderRepository.save(f);
        }

        int count = 0;
        for (int i = 0; i < files.length; i++) {
            MultipartFile file = files[i];
            String entryName = (paths != null && paths.length > i && paths[i] != null) ? paths[i] : file.getOriginalFilename();
            entryName = entryName.replace("\\", "/");
            String relDir = entryName.contains("/") ? entryName.substring(0, entryName.lastIndexOf('/')) : "";
            Path targetDir = relDir.isEmpty() ? targetBase : targetBase.resolve(relDir).normalize();
            try { Files.createDirectories(targetDir); } catch (Exception ignore) {}

            String fullFolderPath = normParam.equals("/") ? (relDir.isEmpty() ? "/" : "/" + relDir) : (normParam + (normParam.endsWith("/") ? "" : "/") + relDir);
            fullFolderPath = fullFolderPath.replaceAll("/+", "/");
            if (!fullFolderPath.startsWith("/")) fullFolderPath = "/" + fullFolderPath;
            if (fullFolderPath.endsWith("/")) fullFolderPath = fullFolderPath.substring(0, fullFolderPath.length() - 1);
            if (fullFolderPath.isEmpty()) fullFolderPath = "/";

            if (!userFolderRepository.existsByUser_IdAndFolderPath(userId, fullFolderPath)) {
                UserFolder sub = new UserFolder();
                sub.setUser(user);
                String folderName = fullFolderPath.substring(fullFolderPath.lastIndexOf('/') + 1);
                sub.setFolderName(folderName.isEmpty() ? "根目录" : folderName);
                sub.setFolderPath(fullFolderPath);
                String parentPath = fullFolderPath.substring(0, fullFolderPath.lastIndexOf('/'));
                if (parentPath.isEmpty()) parentPath = "/";
                sub.setParentPath(parentPath);
                userFolderRepository.save(sub);
            }

            String originalFilename = entryName.contains("/") ? entryName.substring(entryName.lastIndexOf('/') + 1) : entryName;
            String extension = (originalFilename != null && originalFilename.contains(".")) ? originalFilename.substring(originalFilename.lastIndexOf('.')) : "";
            String uniqueFilename = java.util.UUID.randomUUID().toString() + (extension.isEmpty() ? "" : extension);
            Path physicalTarget = targetDir.resolve(uniqueFilename).normalize();
            Files.copy(file.getInputStream(), physicalTarget, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

            UserFile uf = new UserFile();
            uf.setUser(user);
            uf.setFilename(originalFilename);
            uf.setOriginalFilename(originalFilename);
            String relFilePath = fullFolderPath.endsWith("/") ? (fullFolderPath + uniqueFilename) : (fullFolderPath + "/" + uniqueFilename);
            uf.setFilepath(relFilePath);
            try { uf.setFileSize(Files.size(physicalTarget)); } catch (Exception e) { uf.setFileSize(0L); }
            String mime = file.getContentType();
            if (mime == null || mime.isEmpty()) {
                mime = FileUtils.getContentType(physicalTarget);
            }
            if (mime != null) {
                int semi = mime.indexOf(';');
                if (semi > 0) mime = mime.substring(0, semi).trim();
                if (mime.length() > 50) mime = mime.substring(0, 50);
            }
            uf.setFileType(mime);
            uf.setFolderPath(fullFolderPath);
            userFileRepository.save(uf);
            count++;
        }
        return count;
    }

    @Transactional
    public void migrateToUnifiedBase() {
        Path unified = Paths.get(getCloudDiskAbsolutePath());
        try { Files.createDirectories(unified); } catch (Exception ignore) {}
        Path cwd = Paths.get(System.getProperty("user.dir"));
        Path oldBase1 = cwd.resolve("cloud_disk").normalize();
        Path oldBase2 = cwd.resolve("aispring").resolve("cloud_disk").normalize();
        List<UserFile> files = userFileRepository.findAll();
        for (UserFile f : files) {
            Long uid = f.getUser().getId();
            String rel = f.getFilepath();
            String target = unified.resolve(String.valueOf(uid)).resolve(rel.startsWith("/") ? rel.substring(1) : rel).toString();
            Path targetPath = Paths.get(target).normalize();
            if (Files.exists(targetPath) && Files.isRegularFile(targetPath)) {
                continue;
            }
            String normRel = rel != null && rel.startsWith("/") ? rel.substring(1) : rel;
            if (normRel == null || normRel.isEmpty()) {
                continue;
            }
            String first = normRel.split("/")[0];
            String remain = normRel.substring(first.length());
            Path altInUnified = unified.resolve(String.valueOf(uid) + first).resolve(remain.startsWith("/") ? remain.substring(1) : remain).normalize();
            Path sourcePath = null;
            if (Files.exists(altInUnified)) {
                sourcePath = altInUnified;
            } else {
                Path altInOld1 = oldBase1.resolve(String.valueOf(uid) + first).resolve(remain.startsWith("/") ? remain.substring(1) : remain).normalize();
                Path altInOld2 = oldBase2.resolve(String.valueOf(uid) + first).resolve(remain.startsWith("/") ? remain.substring(1) : remain).normalize();
                if (Files.exists(altInOld1)) {
                    sourcePath = altInOld1;
                } else if (Files.exists(altInOld2)) {
                    sourcePath = altInOld2;
                }
            }
            if (sourcePath != null && Files.isRegularFile(sourcePath)) {
                try {
                    Files.createDirectories(targetPath.getParent());
                    Files.move(sourcePath, targetPath, StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception ignore) {}
            }
        }
    }
    /**
     * 重命名文件夹
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFolder renameFolder(Long userId, Long folderId, String newName) throws IOException {
        if (newName == null || newName.trim().isEmpty()) {
            throw new IllegalArgumentException("新文件夹名称不能为空");
        }
        UserFolder folder = userFolderRepository.findByIdAndUser_Id(folderId, userId)
            .orElseThrow(() -> new IllegalArgumentException("文件夹不存在"));
        
        String oldPath = folder.getFolderPath();
        String newPath = oldPath.substring(0, oldPath.lastIndexOf("/") + 1) + newName;

        // 重名检测
        if (userFolderRepository.existsByUser_IdAndFolderPath(userId, newPath)) {
            throw new IllegalArgumentException("同级目录已存在同名文件夹");
        }
        
        String oldPhysicalPath = getCloudDiskAbsolutePath() + "/" + userId + oldPath;
        String newPhysicalPath = getCloudDiskAbsolutePath() + "/" + userId + newPath;
        try { Files.createDirectories(Paths.get(newPhysicalPath).normalize().getParent()); } catch (Exception ignore) {}
        
        // 重命名物理文件夹
            Files.move(Paths.get(oldPhysicalPath), Paths.get(newPhysicalPath), StandardCopyOption.REPLACE_EXISTING);
            
            // 更新当前文件夹记录
        folder.setFolderName(newName);
        folder.setFolderPath(newPath);
        folder = userFolderRepository.save(folder);

        // 级联更新子文件夹与文件路径
        String prefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
        String targetPrefix = newPath.endsWith("/") ? newPath : newPath + "/";

        // 子文件夹
        List<UserFolder> subFolders = userFolderRepository.findByUser_IdAndFolderPathStartingWith(userId, prefix);
        for (UserFolder sub : subFolders) {
            String p = sub.getFolderPath();
            String updated = targetPrefix + p.substring(prefix.length());
            sub.setFolderPath(updated);
            String parent = updated.substring(0, updated.lastIndexOf('/'));
            if (parent.isEmpty()) parent = "/";
            sub.setParentPath(parent);
            userFolderRepository.save(sub);
        }

        // 文件
        List<UserFile> allFiles = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
        for (UserFile f : allFiles) {
            String fp = f.getFolderPath();
            if (fp != null && (fp.equals(oldPath) || fp.startsWith(prefix))) {
                String newFolderPath;
                if (fp.equals(oldPath)) {
                    newFolderPath = newPath;
                } else {
                    newFolderPath = targetPrefix + fp.substring(prefix.length());
                }
                String rel = f.getFilepath();
                String newRel;
                if (rel != null) {
                    String relPrefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
                    String targetRelPrefix = newPath.endsWith("/") ? newPath : newPath + "/";
                    if (rel.startsWith(relPrefix)) {
                        newRel = targetRelPrefix + rel.substring(relPrefix.length());
                    } else {
                        // 兼容旧数据：若不以旧前缀开头，仅替换父路径部分
                        int idx = rel.lastIndexOf('/');
                        String filename = idx >= 0 ? rel.substring(idx + 1) : rel;
                        newRel = (newFolderPath.endsWith("/") ? newFolderPath + filename : newFolderPath + "/" + filename);
                    }
                } else {
                    newRel = null;
                }
                f.setFolderPath(newFolderPath);
                f.setFilepath(newRel);
                userFileRepository.save(f);
            }
        }

        return folder;
    }

    /**
     * 同步用户文件和文件夹结构，删除数据库中存在但物理文件/文件夹不存在的记录
     */
    @Transactional(rollbackFor = Exception.class)
    public void synchronizeUserFilesAndFolders(Long userId) {
        // 1. 同步文件夹
        List<UserFolder> userFolders = userFolderRepository.findByUser_IdOrderByIdAsc(userId);
        String userBasePhysicalPath = getCloudDiskAbsolutePath() + "/" + userId;

        for (UserFolder folder : userFolders) {
            String folderPhysicalPath = userBasePhysicalPath + folder.getFolderPath();
            Path path = Paths.get(folderPhysicalPath);

            if (!Files.exists(path) || !Files.isDirectory(path)) {
                System.out.println("检测到数据库中存在但物理路径不存在的文件夹，正在删除: " + folderPhysicalPath);
                userFolderRepository.delete(folder);
            }
        }

        // 2. 同步文件
        List<UserFile> userFiles = userFileRepository.findByUser_IdOrderByUploadTimeDesc(userId);
        for (UserFile file : userFiles) {
            String filePhysicalPath = userBasePhysicalPath + file.getFilepath();
            Path path = Paths.get(filePhysicalPath);

            if (!Files.exists(path) || !Files.isRegularFile(path)) {
                System.out.println("检测到数据库中存在但物理文件不存在的文件，正在删除: " + filePhysicalPath);
                userFileRepository.delete(file);
            }
        }
    }

    /**
     * 验证所有文件的完整性
     * 检查数据库记录与物理文件是否一致
     */
    @Transactional(readOnly = true)
    public Map<String, Object> verifyAllFiles() {
        List<UserFile> allFiles = userFileRepository.findAllWithUser();
        List<Map<String, Object>> missingFiles = new ArrayList<>();
        int totalFiles = allFiles.size();
        int validFiles = 0;
        int missingCount = 0;

        for (UserFile file : allFiles) {
            try {
                Long userId = file.getUser().getId();
                String rel = file.getFilepath();
                
                if (rel == null) {
                    missingFiles.add(createFileInfo(file, "文件路径为空", null));
                    missingCount++;
                    continue;
                }

                String relNorm = rel.startsWith("/") ? rel.substring(1) : rel;
                Path base = Paths.get(getCloudDiskAbsolutePath()).normalize();
                Path userBase = base.resolve(String.valueOf(userId)).normalize();
                Path filePath = userBase.resolve(relNorm).normalize();

                boolean found = Files.exists(filePath) && Files.isRegularFile(filePath);
                
                if (!found) {
                    // 尝试其他路径
                    String userIdStr = String.valueOf(userId);
                    if (relNorm.startsWith(userIdStr + "/")) {
                        String subRel = relNorm.substring(userIdStr.length() + 1);
                        Path altPath = userBase.resolve(subRel).normalize();
                        if (Files.exists(altPath) && Files.isRegularFile(altPath)) {
                            found = true;
                            filePath = altPath;
                        }
                    }
                    
                    if (!found) {
                        Path directPath = base.resolve(relNorm).normalize();
                        if (Files.exists(directPath) && Files.isRegularFile(directPath)) {
                            found = true;
                            filePath = directPath;
                        }
                    }
                }

                if (found) {
                    validFiles++;
                } else {
                    missingFiles.add(createFileInfo(file, "物理文件不存在", filePath.toString()));
                    missingCount++;
                }
            } catch (Exception e) {
                missingFiles.add(createFileInfo(file, "验证失败: " + e.getMessage(), null));
                missingCount++;
            }
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("totalFiles", totalFiles);
        result.put("validFiles", validFiles);
        result.put("missingFiles", missingCount);
        result.put("missingFileDetails", missingFiles);
        return result;
    }

    /**
     * 清理孤立的文件记录（数据库中存在但物理文件不存在）
     */
    @Transactional
    public Map<String, Object> cleanupOrphanFiles() {
        List<UserFile> allFiles = userFileRepository.findAllWithUser();
        List<Map<String, Object>> deletedFiles = new ArrayList<>();
        int deletedCount = 0;

        for (UserFile file : allFiles) {
            try {
                Long userId = file.getUser().getId();
                String rel = file.getFilepath();
                
                if (rel == null) {
                    userFileRepository.delete(file);
                    deletedFiles.add(createFileInfo(file, "文件路径为空", null));
                    deletedCount++;
                    continue;
                }

                String relNorm = rel.startsWith("/") ? rel.substring(1) : rel;
                Path base = Paths.get(getCloudDiskAbsolutePath()).normalize();
                Path userBase = base.resolve(String.valueOf(userId)).normalize();
                Path filePath = userBase.resolve(relNorm).normalize();

                boolean found = Files.exists(filePath) && Files.isRegularFile(filePath);
                
                if (!found) {
                    // 尝试其他路径
                    String userIdStr = String.valueOf(userId);
                    if (relNorm.startsWith(userIdStr + "/")) {
                        String subRel = relNorm.substring(userIdStr.length() + 1);
                        Path altPath = userBase.resolve(subRel).normalize();
                        if (Files.exists(altPath) && Files.isRegularFile(altPath)) {
                            found = true;
                        }
                    }
                    
                    if (!found) {
                        Path directPath = base.resolve(relNorm).normalize();
                        if (Files.exists(directPath) && Files.isRegularFile(directPath)) {
                            found = true;
                        }
                    }
                }

                if (!found) {
                    userFileRepository.delete(file);
                    deletedFiles.add(createFileInfo(file, "物理文件不存在", filePath.toString()));
                    deletedCount++;
                }
            } catch (Exception e) {
                // 如果验证失败，为安全起见不删除
                log.error("Error checking file {}: {}", file.getId(), e.getMessage());
            }
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("deletedCount", deletedCount);
        result.put("deletedFiles", deletedFiles);
        return result;
    }

    private Map<String, Object> createFileInfo(UserFile file, String reason, String attemptedPath) {
        Map<String, Object> info = new java.util.HashMap<>();
        info.put("fileId", file.getId());
        info.put("userId", file.getUser().getId());
        info.put("filename", file.getOriginalFilename());
        info.put("filepath", file.getFilepath());
        info.put("reason", reason);
        if (attemptedPath != null) {
            info.put("attemptedPath", attemptedPath);
        }
        return info;
    }
}


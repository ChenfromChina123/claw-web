package com.aispring.sftp.service.impl;

import com.aispring.sftp.dto.FileInfo;
import com.aispring.sftp.pool.SFTPClientPool;
import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.sftp.RemoteResourceInfo;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.xfer.FilePermission;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * SFTP 目录操作服务
 * 负责目录列表、创建、删除等操作
 */
@Component
@Slf4j
public class SftpDirectoryService {

    private final SFTPClientPool sftpPool;

    public SftpDirectoryService(SFTPClientPool sftpPool) {
        this.sftpPool = sftpPool;
    }

    /**
     * 列出目录下的文件和子目录
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @return 文件信息列表
     */
    public List<FileInfo> listFiles(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            List<RemoteResourceInfo> resources = sftp.ls(path);
            List<FileInfo> files = new ArrayList<>();

            for (RemoteResourceInfo info : resources) {
                if (".".equals(info.getName()) || "..".equals(info.getName())) {
                    continue;
                }

                FileInfo fileInfo = FileInfo.builder()
                    .name(info.getName())
                    .path(info.getPath())
                    .isDirectory(info.isDirectory())
                    .size(info.isDirectory() ? 0 : info.getAttributes().getSize())
                    .modifiedTime(convertToLocalDateTime((int) info.getAttributes().getMtime()))
                    .permissions(formatPermissions(info.getAttributes().getMode().getPermissions()))
                    .build();

                files.add(fileInfo);
            }

            files.sort((a, b) -> {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.getName().compareToIgnoreCase(b.getName());
            });

            log.debug("列出目录文件: serverId={}, path={}, count={}", serverId, path, files.size());
            return files;

        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 创建目录
     * @param serverId 服务器 ID
     * @param path 目录路径
     */
    public void mkdir(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            sftp.mkdirs(path);
            log.info("目录已创建: serverId={}, path={}", serverId, path);
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 删除目录（递归）
     * @param serverId 服务器 ID
     * @param path 目录路径
     */
    public void deleteDirectory(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            deleteDirectoryRecursive(sftp, path);
            log.info("目录已删除: serverId={}, path={}", serverId, path);
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 递归删除目录
     */
    private void deleteDirectoryRecursive(SFTPClient sftp, String path) throws Exception {
        List<RemoteResourceInfo> resources = sftp.ls(path);

        for (RemoteResourceInfo info : resources) {
            if (".".equals(info.getName()) || "..".equals(info.getName())) {
                continue;
            }

            String fullPath = info.getPath();
            if (info.isDirectory()) {
                deleteDirectoryRecursive(sftp, fullPath);
            } else {
                sftp.rm(fullPath);
            }
        }

        sftp.rmdir(path);
    }

    /**
     * 检查路径是否存在
     * @param serverId 服务器 ID
     * @param path 路径
     * @return 是否存在
     */
    public boolean exists(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            try {
                sftp.stat(path);
                return true;
            } catch (net.schmizz.sshj.sftp.SFTPException e) {
                if (net.schmizz.sshj.sftp.Response.StatusCode.NO_SUCH_FILE.equals(e.getStatusCode())) {
                    return false;
                }
                throw e;
            }
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 获取文件信息
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @return 文件信息
     */
    public FileInfo getFileInfo(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            net.schmizz.sshj.sftp.FileAttributes attrs = sftp.stat(path);

            String name = path.substring(path.lastIndexOf('/') + 1);

            return FileInfo.builder()
                .name(name)
                .path(path)
                .isDirectory(attrs.getType().toString().contains("DIR"))
                .size(attrs.getSize())
                .modifiedTime(convertToLocalDateTime((int) attrs.getMtime()))
                .permissions(formatPermissions(attrs.getMode().getPermissions()))
                .build();
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 将 Unix 时间戳转换为 LocalDateTime
     */
    private LocalDateTime convertToLocalDateTime(int timestamp) {
        return LocalDateTime.ofInstant(
            Instant.ofEpochSecond(timestamp),
            ZoneId.systemDefault()
        );
    }

    /**
     * 格式化权限字符串
     */
    private String formatPermissions(Set<FilePermission> permissions) {
        StringBuilder sb = new StringBuilder();

        sb.append(permissions.contains(FilePermission.USR_R) ? 'r' : '-');
        sb.append(permissions.contains(FilePermission.USR_W) ? 'w' : '-');
        sb.append(permissions.contains(FilePermission.USR_X) ? 'x' : '-');
        sb.append(permissions.contains(FilePermission.GRP_R) ? 'r' : '-');
        sb.append(permissions.contains(FilePermission.GRP_W) ? 'w' : '-');
        sb.append(permissions.contains(FilePermission.GRP_X) ? 'x' : '-');
        sb.append(permissions.contains(FilePermission.OTH_R) ? 'r' : '-');
        sb.append(permissions.contains(FilePermission.OTH_W) ? 'w' : '-');
        sb.append(permissions.contains(FilePermission.OTH_X) ? 'x' : '-');

        return sb.toString();
    }
}

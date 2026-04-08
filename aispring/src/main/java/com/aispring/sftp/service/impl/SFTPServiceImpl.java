package com.aispring.sftp.service.impl;

import com.aispring.sftp.dto.FileInfo;
import com.aispring.sftp.dto.TransferProgress;
import com.aispring.sftp.pool.SFTPClientPool;
import com.aispring.sftp.service.SFTPService;
import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.sftp.SFTPClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.function.Consumer;

/**
 * SFTP 服务实现类
 * 重构后：门面模式，委托具体操作给专门的服务类
 */
@Slf4j
@Service
public class SFTPServiceImpl implements SFTPService {

    private SftpTransferService transferService;
    private SftpDirectoryService directoryService;
    private SFTPClientPool sftpPool;

    @Autowired
    public void setSftpPool(SFTPClientPool sftpPool) {
        this.sftpPool = sftpPool;
        this.transferService = new SftpTransferService(sftpPool);
        this.directoryService = new SftpDirectoryService(sftpPool);
    }

    /**
     * 列出目录下的文件和子目录
     */
    @Override
    public List<FileInfo> listFiles(Long serverId, String path) throws Exception {
        return directoryService.listFiles(serverId, path);
    }

    /**
     * 上传文件
     */
    @Override
    public void uploadFile(Long serverId, String remotePath, InputStream inputStream,
                          long fileSize, Consumer<TransferProgress> progressCallback) throws Exception {
        transferService.uploadFile(serverId, remotePath, inputStream, fileSize, progressCallback);
    }

    /**
     * 下载文件
     */
    @Override
    public void downloadFile(Long serverId, String remotePath, OutputStream outputStream,
                            Consumer<TransferProgress> progressCallback) throws Exception {
        transferService.downloadFile(serverId, remotePath, outputStream, progressCallback);
    }

    /**
     * 删除文件
     */
    @Override
    public void deleteFile(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            sftp.rm(path);
            log.info("文件已删除: serverId={}, path={}", serverId, path);
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 删除目录（递归）
     */
    @Override
    public void deleteDirectory(Long serverId, String path) throws Exception {
        directoryService.deleteDirectory(serverId, path);
    }

    /**
     * 重命名文件或目录
     */
    @Override
    public void rename(Long serverId, String oldPath, String newPath) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            sftp.rename(oldPath, newPath);
            log.info("文件已重命名: serverId={}, {} -> {}", serverId, oldPath, newPath);
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 创建目录
     */
    @Override
    public void mkdir(Long serverId, String path) throws Exception {
        directoryService.mkdir(serverId, path);
    }

    /**
     * 检查路径是否存在
     */
    @Override
    public boolean exists(Long serverId, String path) throws Exception {
        return directoryService.exists(serverId, path);
    }

    /**
     * 获取文件信息
     */
    @Override
    public FileInfo getFileInfo(Long serverId, String path) throws Exception {
        return directoryService.getFileInfo(serverId, path);
    }

    /**
     * 获取文件大小
     */
    @Override
    public long getFileSize(Long serverId, String path) throws Exception {
        return transferService.getFileSize(serverId, path);
    }

    /**
     * 读取文件内容
     */
    @Override
    public String readFileContent(Long serverId, String path, long maxSize) throws Exception {
        return transferService.readFileContent(serverId, path, maxSize);
    }
}

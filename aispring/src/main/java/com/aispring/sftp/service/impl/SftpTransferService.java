package com.aispring.sftp.service.impl;

import com.aispring.sftp.dto.FileInfo;
import com.aispring.sftp.dto.TransferProgress;
import com.aispring.sftp.pool.SFTPClientPool;
import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.sftp.RemoteFile;
import net.schmizz.sshj.sftp.OpenMode;
import net.schmizz.sshj.sftp.SFTPClient;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.EnumSet;
import java.util.Set;
import java.util.function.Consumer;

/**
 * SFTP 文件传输服务
 * 负责文件上传和下载操作
 */
@Component
@Slf4j
public class SftpTransferService {

    private static final int BUFFER_SIZE = 8192;
    private final SFTPClientPool sftpPool;

    public SftpTransferService(SFTPClientPool sftpPool) {
        this.sftpPool = sftpPool;
    }

    /**
     * 上传文件
     * @param serverId 服务器 ID
     * @param remotePath 远程文件路径
     * @param inputStream 文件输入流
     * @param fileSize 文件大小
     * @param progressCallback 进度回调（可选）
     */
    public void uploadFile(Long serverId, String remotePath, InputStream inputStream,
                          long fileSize, Consumer<TransferProgress> progressCallback) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);

            Set<OpenMode> modes = EnumSet.of(OpenMode.WRITE, OpenMode.CREAT, OpenMode.TRUNC);
            RemoteFile file = sftp.open(remotePath, modes);

            long transferred = 0;
            long startTime = System.currentTimeMillis();
            byte[] buffer = new byte[BUFFER_SIZE];
            int bytesRead;
            long lastProgressTime = startTime;

            while ((bytesRead = inputStream.read(buffer)) != -1) {
                file.write(transferred, buffer, 0, bytesRead);
                transferred += bytesRead;

                long currentTime = System.currentTimeMillis();
                if (progressCallback != null && currentTime - lastProgressTime >= 200) {
                    TransferProgress progress = createProgress(
                        remotePath, fileSize, transferred, startTime, currentTime);
                    progressCallback.accept(progress);
                    lastProgressTime = currentTime;
                }
            }

            file.close();

            if (progressCallback != null) {
                TransferProgress progress = createProgress(
                    remotePath, fileSize, transferred, startTime, System.currentTimeMillis());
                progress.setStatus(TransferProgress.TransferStatus.COMPLETED);
                progressCallback.accept(progress);
            }

            log.info("文件上传完成: serverId={}, path={}, size={}", serverId, remotePath, transferred);

        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 下载文件
     * @param serverId 服务器 ID
     * @param remotePath 远程文件路径
     * @param outputStream 输出流
     * @param progressCallback 进度回调（可选）
     */
    public void downloadFile(Long serverId, String remotePath, OutputStream outputStream,
                            Consumer<TransferProgress> progressCallback) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);

            long fileSize = sftp.size(remotePath);
            RemoteFile file = sftp.open(remotePath);

            long transferred = 0;
            long startTime = System.currentTimeMillis();
            byte[] buffer = new byte[BUFFER_SIZE];
            long lastProgressTime = startTime;

            int bytesRead;

            while (transferred < fileSize) {
                bytesRead = file.read(transferred, buffer, 0,
                    (int) Math.min(BUFFER_SIZE, fileSize - transferred));
                if (bytesRead == -1) break;

                outputStream.write(buffer, 0, bytesRead);
                transferred += bytesRead;

                long currentTime = System.currentTimeMillis();
                if (progressCallback != null && currentTime - lastProgressTime >= 200) {
                    TransferProgress progress = createProgress(
                        remotePath, fileSize, transferred, startTime, currentTime);
                    progressCallback.accept(progress);
                    lastProgressTime = currentTime;
                }
            }

            file.close();
            outputStream.flush();

            if (progressCallback != null) {
                TransferProgress progress = createProgress(
                    remotePath, fileSize, transferred, startTime, System.currentTimeMillis());
                progress.setStatus(TransferProgress.TransferStatus.COMPLETED);
                progressCallback.accept(progress);
            }

            log.info("文件下载完成: serverId={}, path={}, size={}", serverId, remotePath, transferred);

        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 读取文件内容
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @param maxSize 最大读取大小（字节）
     * @return 文件内容
     */
    public String readFileContent(Long serverId, String path, long maxSize) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            
            long fileSize = sftp.size(path);
            long readSize = Math.min(fileSize, maxSize);
            
            RemoteFile file = sftp.open(path, EnumSet.of(OpenMode.READ));
            
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[BUFFER_SIZE];
            long transferred = 0;
            int bytesRead;
            
            while (transferred < readSize) {
                int toRead = (int) Math.min(buffer.length, readSize - transferred);
                bytesRead = file.read(transferred, buffer, 0, toRead);
                
                if (bytesRead == -1) break;
                
                outputStream.write(buffer, 0, bytesRead);
                transferred += bytesRead;
            }
            
            file.close();
            
            String content = outputStream.toString("UTF-8");
            
            if (fileSize > maxSize) {
                content += "\n\n... [文件过大，只显示前 " + maxSize + " 字节]";
            }
            
            log.info("文件内容读取完成: serverId={}, path={}, size={}", serverId, path, transferred);
            
            return content;
            
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 获取文件大小
     */
    public long getFileSize(Long serverId, String path) throws Exception {
        SFTPClient sftp = null;
        try {
            sftp = sftpPool.borrowObject(serverId);
            return sftp.size(path);
        } finally {
            if (sftp != null) {
                sftpPool.returnObject(serverId, sftp);
            }
        }
    }

    /**
     * 创建传输进度对象
     */
    private TransferProgress createProgress(String path, long totalSize, long transferred,
                                           long startTime, long currentTime) {
        int progress = totalSize > 0 ? (int) ((transferred * 100) / totalSize) : 0;
        String speed = TransferProgress.calculateSpeed(transferred, currentTime - startTime);
        String fileName = path.substring(path.lastIndexOf('/') + 1);

        return TransferProgress.builder()
            .fileName(fileName)
            .filePath(path)
            .totalSize(totalSize)
            .transferredSize(transferred)
            .progress(progress)
            .speed(speed)
            .status(TransferProgress.TransferStatus.TRANSFERRING)
            .startTime(startTime)
            .build();
    }
}

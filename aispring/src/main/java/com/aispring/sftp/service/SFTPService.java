package com.aispring.sftp.service;

import com.aispring.sftp.dto.FileInfo;
import com.aispring.sftp.dto.TransferProgress;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.function.Consumer;

/**
 * SFTP 服务接口
 * 提供远程服务器文件操作功能
 */
public interface SFTPService {

    /**
     * 列出目录下的文件和子目录
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @return 文件信息列表
     * @throws Exception 操作失败时抛出异常
     */
    List<FileInfo> listFiles(Long serverId, String path) throws Exception;

    /**
     * 上传文件
     * @param serverId 服务器 ID
     * @param remotePath 远程文件路径
     * @param inputStream 文件输入流
     * @param fileSize 文件大小
     * @param progressCallback 进度回调（可选）
     * @throws Exception 操作失败时抛出异常
     */
    void uploadFile(Long serverId, String remotePath, InputStream inputStream, 
                    long fileSize, Consumer<TransferProgress> progressCallback) throws Exception;

    /**
     * 下载文件
     * @param serverId 服务器 ID
     * @param remotePath 远程文件路径
     * @param outputStream 输出流
     * @param progressCallback 进度回调（可选）
     * @throws Exception 操作失败时抛出异常
     */
    void downloadFile(Long serverId, String remotePath, OutputStream outputStream,
                      Consumer<TransferProgress> progressCallback) throws Exception;

    /**
     * 删除文件
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @throws Exception 操作失败时抛出异常
     */
    void deleteFile(Long serverId, String path) throws Exception;

    /**
     * 删除目录（递归）
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @throws Exception 操作失败时抛出异常
     */
    void deleteDirectory(Long serverId, String path) throws Exception;

    /**
     * 重命名文件或目录
     * @param serverId 服务器 ID
     * @param oldPath 原路径
     * @param newPath 新路径
     * @throws Exception 操作失败时抛出异常
     */
    void rename(Long serverId, String oldPath, String newPath) throws Exception;

    /**
     * 创建目录
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @throws Exception 操作失败时抛出异常
     */
    void mkdir(Long serverId, String path) throws Exception;

    /**
     * 检查路径是否存在
     * @param serverId 服务器 ID
     * @param path 路径
     * @return 是否存在
     * @throws Exception 操作失败时抛出异常
     */
    boolean exists(Long serverId, String path) throws Exception;

    /**
     * 获取文件信息
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @return 文件信息
     * @throws Exception 操作失败时抛出异常
     */
    FileInfo getFileInfo(Long serverId, String path) throws Exception;

    /**
     * 获取文件大小
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @return 文件大小（字节）
     * @throws Exception 操作失败时抛出异常
     */
    long getFileSize(Long serverId, String path) throws Exception;

    /**
     * 读取文件内容
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @param maxSize 最大读取大小（字节），超过则截断
     * @return 文件内容
     * @throws Exception 操作失败时抛出异常
     */
    String readFileContent(Long serverId, String path, long maxSize) throws Exception;
}

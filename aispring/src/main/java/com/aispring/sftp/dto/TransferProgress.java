package com.aispring.sftp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 传输进度 DTO
 * 用于 WebSocket 推送文件传输进度
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransferProgress {
    
    private String taskId;
    
    private String fileName;
    
    private String filePath;
    
    private long totalSize;
    
    private long transferredSize;
    
    private int progress;
    
    private String speed;
    
    private TransferStatus status;
    
    private String errorMessage;
    
    private long startTime;
    
    private long endTime;
    
    /**
     * 传输状态枚举
     */
    public enum TransferStatus {
        PENDING,
        TRANSFERRING,
        PAUSED,
        COMPLETED,
        FAILED,
        CANCELLED
    }
    
    /**
     * 计算传输速度
     * @param bytesTransferred 已传输字节数
     * @param elapsedMillis 耗时（毫秒）
     * @return 格式化的速度字符串
     */
    public static String calculateSpeed(long bytesTransferred, long elapsedMillis) {
        if (elapsedMillis <= 0) {
            return "0 B/s";
        }
        
        double bytesPerSecond = (bytesTransferred * 1000.0) / elapsedMillis;
        
        if (bytesPerSecond < 1024) {
            return String.format("%.0f B/s", bytesPerSecond);
        } else if (bytesPerSecond < 1024 * 1024) {
            return String.format("%.1f KB/s", bytesPerSecond / 1024);
        } else if (bytesPerSecond < 1024 * 1024 * 1024) {
            return String.format("%.1f MB/s", bytesPerSecond / (1024 * 1024));
        } else {
            return String.format("%.1f GB/s", bytesPerSecond / (1024 * 1024 * 1024));
        }
    }
}

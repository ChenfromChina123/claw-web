package com.aispring.sftp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 文件信息 DTO
 * 用于传输远程服务器文件信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileInfo {
    
    private String name;
    
    private String path;
    
    private boolean isDirectory;
    
    private long size;
    
    private LocalDateTime modifiedTime;
    
    private String permissions;
    
    private String owner;
    
    private String group;
}

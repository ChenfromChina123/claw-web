package com.aispring.dto.request;

import lombok.Data;

/**
 * 服务器连接请求DTO
 */
@Data
public class ServerConnectionRequest {
    private String serverName;
    private String host;
    private String username;
    private String password;
    private Integer port = 22;
}

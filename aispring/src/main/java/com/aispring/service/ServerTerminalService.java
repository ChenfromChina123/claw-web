package com.aispring.service;

import com.aispring.entity.ServerConnection;
import com.aispring.entity.ServerCommandExecution;
import com.aispring.exception.CustomException;

import java.util.List;

/**
 * 服务器终端服务接口
 */
public interface ServerTerminalService {

    /**
     * 获取用户的服务器连接列表
     */
    List<ServerConnection> getServers(Long userId);

    /**
     * 添加服务器连接
     */
    ServerConnection addServer(Long userId, String serverName, String host, String username, String password, Integer port);

    /**
     * 删除服务器连接
     */
    void deleteServer(Long userId, Long serverId);

    /**
     * 连接到服务器
     */
    String connectServer(Long userId, Long serverId) throws CustomException;

    /**
     * 断开服务器连接
     */
    void disconnectServer(Long userId, Long serverId);

    /**
     * 执行服务器命令
     */
    ServerCommandExecution executeCommand(Long userId, Long serverId, String command) throws CustomException;

    /**
     * 获取命令执行结果
     */
    ServerCommandExecution getExecutionResult(Long userId, Long executionId);

    /**
     * 获取服务器的命令执行历史
     */
    List<ServerCommandExecution> getExecutionHistory(Long userId, Long serverId);
}

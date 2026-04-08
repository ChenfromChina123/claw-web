package com.aispring.service.impl;

import com.aispring.entity.ServerConnection;
import com.aispring.entity.ServerCommandExecution;
import com.aispring.entity.User;
import com.aispring.exception.CustomException;
import com.aispring.repository.ServerCommandExecutionRepository;
import com.aispring.repository.ServerConnectionRepository;
import com.aispring.repository.UserRepository;
import com.aispring.service.ServerTerminalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 服务器终端服务实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ServerTerminalServiceImpl implements ServerTerminalService {

    private final ServerConnectionRepository serverConnectionRepository;
    private final ServerCommandExecutionRepository serverCommandExecutionRepository;
    private final UserRepository userRepository;

    // 存储服务器连接（按用户ID和服务器ID分类）
    private final Map<Long, Map<Long, com.jcraft.jsch.Session>> serverSessions = new ConcurrentHashMap<>();

    @Override
    public List<ServerConnection> getServers(Long userId) {
        return serverConnectionRepository.findByUserId(userId);
    }

    @Override
    @Transactional
    public ServerConnection addServer(Long userId, String serverName, String host, String username, String password, Integer port) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new CustomException("用户不存在"));

        ServerConnection server = new ServerConnection(user, serverName, host, username, password, port);
        return serverConnectionRepository.save(server);
    }

    @Override
    @Transactional
    public void deleteServer(Long userId, Long serverId) {
        // 先断开连接
        disconnectServer(userId, serverId);

        // 删除服务器连接
        ServerConnection server = serverConnectionRepository.findByIdAndUserId(serverId, userId);
        if (server == null) {
            throw new CustomException("服务器不存在或无权限操作");
        }
        serverConnectionRepository.delete(server);
    }

    @Override
    public String connectServer(Long userId, Long serverId) throws CustomException {
        // 检查服务器是否存在且属于当前用户
        ServerConnection server = serverConnectionRepository.findByIdAndUserId(serverId, userId);
        if (server == null) {
            throw new CustomException("服务器不存在或无权限操作");
        }

        try {
            // 使用JSch创建SSH连接
            com.jcraft.jsch.JSch jsch = new com.jcraft.jsch.JSch();
            com.jcraft.jsch.Session session = jsch.getSession(
                    server.getUsername(),
                    server.getHost(),
                    server.getPort()
            );

            // 设置密码认证
            session.setPassword(server.getPassword());

            // 设置不检查主机密钥
            session.setConfig("StrictHostKeyChecking", "no");

            // 连接服务器
            session.connect();

            // 存储连接
            serverSessions.computeIfAbsent(userId, k -> new HashMap<>()).put(serverId, session);

            log.info("用户 {} 连接到服务器 {} ({}:{})", userId, server.getServerName(), server.getHost(), server.getPort());
            return "连接成功";
        } catch (Exception e) {
            log.error("连接服务器失败: {}", e.getMessage());
            throw new CustomException("连接服务器失败: " + e.getMessage());
        }
    }

    @Override
    public void disconnectServer(Long userId, Long serverId) {
        try {
            if (serverSessions.containsKey(userId) && serverSessions.get(userId).containsKey(serverId)) {
                com.jcraft.jsch.Session session = serverSessions.get(userId).get(serverId);
                if (session != null && session.isConnected()) {
                    session.disconnect();
                }
                serverSessions.get(userId).remove(serverId);
                log.info("用户 {} 断开与服务器 {} 的连接", userId, serverId);
            }
        } catch (Exception e) {
            log.error("断开服务器连接失败: {}", e.getMessage());
        }
    }

    @Override
    @Transactional
    public ServerCommandExecution executeCommand(Long userId, Long serverId, String command) throws CustomException {
        // 检查服务器是否存在且属于当前用户
        ServerConnection server = serverConnectionRepository.findByIdAndUserId(serverId, userId);
        if (server == null) {
            throw new CustomException("服务器不存在或无权限操作");
        }

        // 检查连接是否存在
        if (!serverSessions.containsKey(userId) || !serverSessions.get(userId).containsKey(serverId)) {
            throw new CustomException("未连接到服务器");
        }

        com.jcraft.jsch.Session session = serverSessions.get(userId).get(serverId);
        if (!session.isConnected()) {
            throw new CustomException("服务器连接已断开");
        }

        try {
            // 创建通道并执行命令
            com.jcraft.jsch.Channel channel = session.openChannel("exec");
            ((com.jcraft.jsch.ChannelExec) channel).setCommand(command);

            // 获取输入输出流
            java.io.InputStream in = channel.getInputStream();
            java.io.InputStream err = ((com.jcraft.jsch.ChannelExec) channel).getErrStream();

            // 开始执行命令
            channel.connect();

            // 读取输出
            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();
            byte[] tmp = new byte[1024];

            while (true) {
                while (in.available() > 0) {
                    int i = in.read(tmp, 0, 1024);
                    if (i < 0) break;
                    stdout.append(new String(tmp, 0, i));
                }
                while (err.available() > 0) {
                    int i = err.read(tmp, 0, 1024);
                    if (i < 0) break;
                    stderr.append(new String(tmp, 0, i));
                }
                if (channel.isClosed()) {
                    break;
                }
                try {
                    Thread.sleep(100);
                } catch (Exception e) {
                    // 忽略
                }
            }

            // 获取返回码
            int returnCode = channel.getExitStatus();

            // 关闭通道
            channel.disconnect();

            // 保存命令执行记录
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new CustomException("用户不存在"));

            ServerCommandExecution execution = new ServerCommandExecution(user, server, command);
            execution.setStdout(stdout.toString());
            execution.setStderr(stderr.toString());
            execution.setReturnCode(returnCode);

            serverCommandExecutionRepository.save(execution);

            log.info("用户 {} 在服务器 {} 执行命令: {}", userId, server.getServerName(), command);
            return execution;
        } catch (Exception e) {
            log.error("执行命令失败: {}", e.getMessage());
            throw new CustomException("执行命令失败: " + e.getMessage());
        }
    }

    @Override
    public ServerCommandExecution getExecutionResult(Long userId, Long executionId) {
        ServerCommandExecution execution = serverCommandExecutionRepository.findById(executionId)
                .orElseThrow(() -> new CustomException("执行记录不存在"));

        // 检查执行记录是否属于当前用户
        if (!execution.getUser().getId().equals(userId)) {
            throw new CustomException("无权限访问此执行记录");
        }

        return execution;
    }

    @Override
    public List<ServerCommandExecution> getExecutionHistory(Long userId, Long serverId) {
        // 检查服务器是否存在且属于当前用户
        ServerConnection server = serverConnectionRepository.findByIdAndUserId(serverId, userId);
        if (server == null) {
            throw new CustomException("服务器不存在或无权限操作");
        }

        return serverCommandExecutionRepository.findByUserIdAndServerId(userId, serverId);
    }
}

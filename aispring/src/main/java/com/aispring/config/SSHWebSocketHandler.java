package com.aispring.config;

import com.aispring.entity.ServerConnection;
import com.aispring.repository.ServerConnectionRepository;
import com.jcraft.jsch.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
public class SSHWebSocketHandler extends TextWebSocketHandler {

    private static ServerConnectionRepository serverConnectionRepository;
    private static final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private static final Map<String, com.jcraft.jsch.Session> jschSessions = new ConcurrentHashMap<>();
    private static final Map<String, ChannelShell> channels = new ConcurrentHashMap<>();
    private static final Map<String, OutputStream> outputStreams = new ConcurrentHashMap<>();
    private final ExecutorService sshExecutor;

    public SSHWebSocketHandler(
            @org.springframework.beans.factory.annotation.Qualifier("sshExecutor") ExecutorService sshExecutor) {
        this.sshExecutor = sshExecutor;
    }

    @Autowired
    public void setServerConnectionRepository(ServerConnectionRepository repository) {
        SSHWebSocketHandler.serverConnectionRepository = repository;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        log.info("WebSocket 连接已建立：sessionId={}", session.getId());
        sessions.put(session.getId(), session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.info("收到消息：sessionId={}, message={}", session.getId(), payload);

        try {
            if (payload.startsWith("connect:")) {
                String userId = payload.substring(8);
                Long serverId = extractServerId(session);
                if (serverId != null) {
                    handleConnect(session, serverId, userId);
                }
            } else if (payload.startsWith("input:")) {
                String input = payload.substring(6);
                handleInput(session.getId(), input);
            } else if (payload.startsWith("resize:")) {
                String[] parts = payload.substring(7).split(",");
                if (parts.length == 2) {
                    handleResize(session.getId(), Integer.parseInt(parts[0]), Integer.parseInt(parts[1]));
                }
            } else if (payload.equals("disconnect")) {
                handleDisconnect(session.getId());
            }
        } catch (Exception e) {
            log.error("处理消息失败：{}", e.getMessage(), e);
            sendMessage(session, "error:" + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        log.info("WebSocket 连接已关闭：sessionId={}, status={}", session.getId(), status);
        handleDisconnect(session.getId());
        sessions.remove(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket 传输错误：sessionId={}, error={}", session.getId(), exception.getMessage());
        handleDisconnect(session.getId());
    }

    /**
     * 从 WebSocket URI 中提取服务器 ID
     * @param session WebSocket 会话
     * @return 服务器 ID，如果解析失败则返回 null
     */
    private Long extractServerId(WebSocketSession session) {
        String uri = session.getUri() != null ? session.getUri().toString() : "";
        String[] parts = uri.split("/");
        for (int i = 0; i < parts.length; i++) {
            if ("terminal".equals(parts[i]) && i + 1 < parts.length) {
                try {
                    return Long.parseLong(parts[i + 1]);
                } catch (NumberFormatException e) {
                    log.error("解析服务器 ID 失败：{}", parts[i + 1]);
                }
            }
        }
        return null;
    }

    /**
     * 处理 SSH 连接请求
     * @param session WebSocket 会话
     * @param serverId 服务器 ID
     * @param userId 用户 ID
     */
    private void handleConnect(WebSocketSession session, Long serverId, String userId) {
        sshExecutor.submit(() -> {
            com.jcraft.jsch.Session sshSession = null;
            ChannelShell channel = null;
            try {
                ServerConnection server = serverConnectionRepository.findById(serverId).orElse(null);
                if (server == null) {
                    sendMessage(session, "error:服务器不存在");
                    return;
                }

                log.info("正在连接到服务器：{}@{}:{}", server.getUsername(), server.getHost(), server.getPort());

                JSch jsch = new JSch();
                sshSession = jsch.getSession(
                    server.getUsername(),
                    server.getHost(),
                    server.getPort()
                );
                sshSession.setPassword(server.getPassword());
                sshSession.setConfig("StrictHostKeyChecking", "no");
                sshSession.connect(30000);
                log.info("SSH 会话已建立");

                channel = (ChannelShell) sshSession.openChannel("shell");
                channel.setPty(true);
                channel.setPtySize(120, 30, 0, 0);
                channel.connect(30000);
                log.info("Shell 通道已建立");

                OutputStream outputStream = channel.getOutputStream();
                InputStream inputStream = channel.getInputStream();

                jschSessions.put(session.getId(), sshSession);
                channels.put(session.getId(), channel);
                outputStreams.put(session.getId(), outputStream);

                sendMessage(session, "connected:连接成功");
                log.info("用户 {} 连接到服务器 {} 成功，sessionId={}", userId, server.getHost(), session.getId());

                final ChannelShell finalChannel = channel;
                final WebSocketSession finalSession = session;
                final InputStream finalInputStream = inputStream;

                Thread outputThread = new Thread(() -> {
                    try {
                        log.info("SSH 输出读取线程启动：sessionId={}", finalSession.getId());
                        byte[] buffer = new byte[8192];

                        while (finalChannel.isConnected() && !Thread.interrupted()) {
                            if (finalInputStream.available() > 0) {
                                int len = finalInputStream.read(buffer);
                                if (len > 0) {
                                    String output = new String(buffer, 0, len, "UTF-8");
                                    log.info("读取到 SSH 输出 ({} 字节): {}", len,
                                        output.replaceAll("\n", "\\\\n").replaceAll("\r", "\\\\r"));

                                    // 发送到 WebSocket
                                    sendMessage(finalSession, "output:" + output);
                                }
                            } else {
                                Thread.sleep(50);
                            }
                        }
                        log.info("SSH 输出读取线程结束：sessionId={}", finalSession.getId());
                    } catch (Exception e) {
                        log.error("读取 SSH 输出异常：sessionId={}, error={}",
                            finalSession.getId(), e.getMessage(), e);
                    }
                }, "SSH-Output-" + session.getId());
                outputThread.setDaemon(true);
                outputThread.start();

            } catch (Exception e) {
                log.error("连接 SSH 失败：{}", e.getMessage(), e);
                sendMessage(session, "error:" + e.getMessage());
                if (channel != null) {
                    channel.disconnect();
                }
                if (sshSession != null) {
                    sshSession.disconnect();
                }
            }
        });
    }

    /**
     * 处理用户输入的命令
     * @param sessionId WebSocket 会话 ID
     * @param input 用户输入的命令
     */
    private void handleInput(String sessionId, String input) {
        OutputStream outputStream = outputStreams.get(sessionId);
        ChannelShell channel = channels.get(sessionId);

        if (outputStream != null && channel != null && channel.isConnected()) {
            try {
                String command = input.endsWith("\n") ? input : input + "\n";
                outputStream.write(command.getBytes("UTF-8"));
                outputStream.flush();
                log.info("发送命令到 SSH：sessionId={}, command={}", sessionId, command.trim());
            } catch (Exception e) {
                log.error("发送输入失败：sessionId={}, error={}", sessionId, e.getMessage(), e);
            }
        } else {
            log.warn("无法发送命令，通道未连接：sessionId={}", sessionId);
        }
    }

    /**
     * 调整终端窗口大小
     * @param sessionId WebSocket 会话 ID
     * @param width 宽度（列数）
     * @param height 高度（行数）
     */
    private void handleResize(String sessionId, int width, int height) {
        ChannelShell channel = channels.get(sessionId);
        if (channel != null && channel.isConnected()) {
            try {
                channel.setPtySize(width, height, 0, 0);
                log.info("调整终端大小：sessionId={}, {}x{}", sessionId, width, height);
            } catch (Exception e) {
                log.error("调整终端大小失败：{}", e.getMessage());
            }
        }
    }

    /**
     * 断开 SSH 连接
     * @param sessionId WebSocket 会话 ID
     */
    private void handleDisconnect(String sessionId) {
        log.info("断开连接：sessionId={}", sessionId);
        try {
            outputStreams.remove(sessionId);

            if (channels.containsKey(sessionId)) {
                channels.get(sessionId).disconnect();
                channels.remove(sessionId);
            }

            if (jschSessions.containsKey(sessionId)) {
                jschSessions.get(sessionId).disconnect();
                jschSessions.remove(sessionId);
            }

            log.info("SSH 连接已断开：sessionId={}", sessionId);
        } catch (Exception e) {
            log.error("断开连接失败：{}", e.getMessage(), e);
        }
    }

    /**
     * 发送消息到 WebSocket 客户端
     * @param session WebSocket 会话
     * @param message 消息内容
     */
    private void sendMessage(WebSocketSession session, String message) {
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(message));
                }
            } catch (Exception e) {
                log.error("发送消息失败：{}", e.getMessage());
            }
        }
    }
}

package com.aispring.sftp.pool;

import com.aispring.entity.ServerConnection;
import com.aispring.repository.ServerConnectionRepository;
import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.apache.commons.pool2.PooledObject;
import org.apache.commons.pool2.PooledObjectFactory;
import org.apache.commons.pool2.impl.DefaultPooledObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SFTP 客户端工厂
 * 负责创建、验证和销毁 SFTP 连接
 */
@Slf4j
@Component
public class SFTPClientFactory implements PooledObjectFactory<SFTPClient> {

    private static ServerConnectionRepository serverConnectionRepository;

    private static final Map<Long, ServerConnection> serverCache = new ConcurrentHashMap<>();

    private static final Map<SFTPClient, SSHClient> sshClientMap = new ConcurrentHashMap<>();

    @Autowired
    public void setServerConnectionRepository(ServerConnectionRepository repository) {
        SFTPClientFactory.serverConnectionRepository = repository;
    }

    /**
     * 当前正在创建连接的服务器 ID（ThreadLocal 存储）
     */
    private static final ThreadLocal<Long> currentServerId = new ThreadLocal<>();

    /**
     * 设置当前线程正在创建连接的服务器 ID
     * @param serverId 服务器 ID
     */
    public static void setCurrentServerId(Long serverId) {
        currentServerId.set(serverId);
    }

    /**
     * 创建 SFTP 客户端对象（Pool2 新版本要求的方法）
     * @return 可池化对象
     * @throws Exception 创建失败时抛出异常
     */
    @Override
    public PooledObject<SFTPClient> makeObject() throws Exception {
        Long serverId = currentServerId.get();
        if (serverId == null) {
            throw new IllegalStateException("未设置服务器 ID，请先调用 setCurrentServerId");
        }

        ServerConnection server = getServerConnection(serverId);
        if (server == null) {
            throw new IllegalArgumentException("服务器不存在: " + serverId);
        }

        log.info("正在创建 SFTP 连接: {}@{}:{}", server.getUsername(), server.getHost(), server.getPort());

        SSHClient ssh = new SSHClient();

        try {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.setConnectTimeout(30000);
            ssh.connect(server.getHost(), server.getPort());

            ssh.authPassword(server.getUsername(), server.getPassword());

            ssh.getConnection().getKeepAlive().setKeepAliveInterval(30);

            SFTPClient sftp = ssh.newSFTPClient();

            sshClientMap.put(sftp, ssh);

            log.info("SFTP 连接创建成功: {}@{}:{}", server.getUsername(), server.getHost(), server.getPort());

            return new DefaultPooledObject<>(sftp);

        } catch (Exception e) {
            log.error("SFTP 连接创建失败: {}@{}:{} - {}", server.getUsername(), server.getHost(),
                server.getPort(), e.getMessage());

            if (ssh.isConnected()) {
                try {
                    ssh.disconnect();
                } catch (Exception ignored) {
                }
            }
            throw e;
        }
    }

    /**
     * 销毁 SFTP 客户端
     * @param pooledObject 可池化对象
     * @throws Exception 销毁失败时抛出异常
     */
    @Override
    public void destroyObject(PooledObject<SFTPClient> pooledObject) throws Exception {
        SFTPClient sftp = pooledObject.getObject();
        if (sftp != null) {
            try {
                SSHClient ssh = sshClientMap.remove(sftp);
                sftp.close();
                if (ssh != null && ssh.isConnected()) {
                    ssh.disconnect();
                }
                log.info("SFTP 连接已销毁");
            } catch (Exception e) {
                log.warn("销毁 SFTP 连接时出错: {}", e.getMessage());
            }
        }
    }

    /**
     * 验证 SFTP 连接是否有效
     * 执行轻量级的 stat("/") 命令检查连接是否存活
     * @param pooledObject 可池化对象
     * @return 连接是否有效
     */
    @Override
    public boolean validateObject(PooledObject<SFTPClient> pooledObject) {
        SFTPClient sftp = pooledObject.getObject();
        if (sftp == null) {
            return false;
        }

        try {
            sftp.stat("/");
            return true;
        } catch (Exception e) {
            log.warn("SFTP 连接验证失败，将被销毁: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 激活对象（从池中取出时调用）
     * @param pooledObject 可池化对象
     * @throws Exception 激活失败时抛出异常
     */
    @Override
    public void activateObject(PooledObject<SFTPClient> pooledObject) throws Exception {
    }

    /**
     * 钝化对象（归还到池中时调用）
     * @param pooledObject 可池化对象
     * @throws Exception 钝化失败时抛出异常
     */
    @Override
    public void passivateObject(PooledObject<SFTPClient> pooledObject) throws Exception {
    }

    /**
     * 获取服务器连接信息
     * @param serverId 服务器 ID
     * @return 服务器连接信息
     */
    private ServerConnection getServerConnection(Long serverId) {
        return serverCache.computeIfAbsent(serverId, id -> {
            if (serverConnectionRepository != null) {
                return serverConnectionRepository.findById(id).orElse(null);
            }
            return null;
        });
    }

    /**
     * 清除服务器缓存
     * @param serverId 服务器 ID
     */
    public static void clearServerCache(Long serverId) {
        serverCache.remove(serverId);
    }
}

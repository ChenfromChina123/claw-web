package com.aispring.sftp.pool;

import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.sftp.SFTPClient;
import org.apache.commons.pool2.impl.GenericObjectPool;
import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SFTP 连接池管理器
 * 为每个服务器维护独立的连接池
 */
@Slf4j
@Component
public class SFTPClientPool {

    private final SFTPClientFactory factory;
    
    private final Map<Long, GenericObjectPool<SFTPClient>> pools = new ConcurrentHashMap<>();

    public SFTPClientPool(SFTPClientFactory factory) {
        this.factory = factory;
    }

    /**
     * 获取指定服务器的连接池配置
     * @return 连接池配置
     */
    private GenericObjectPoolConfig<SFTPClient> createPoolConfig() {
        GenericObjectPoolConfig<SFTPClient> config = new GenericObjectPoolConfig<>();
        config.setMaxTotal(10);
        config.setMaxIdle(5);
        config.setMinIdle(1);
        config.setMaxWaitMillis(30000);
        config.setTestOnBorrow(true);
        config.setTestOnReturn(false);
        config.setTestWhileIdle(true);
        config.setTimeBetweenEvictionRunsMillis(60000);
        config.setMinEvictableIdleTimeMillis(300000);
        config.setBlockWhenExhausted(true);
        return config;
    }

    /**
     * 获取或创建指定服务器的连接池
     * @param serverId 服务器 ID
     * @return 连接池
     */
    private GenericObjectPool<SFTPClient> getOrCreatePool(Long serverId) {
        return pools.computeIfAbsent(serverId, id -> {
            GenericObjectPoolConfig<SFTPClient> config = createPoolConfig();
            return new GenericObjectPool<>(factory, config);
        });
    }

    /**
     * 从连接池借用 SFTP 客户端
     * @param serverId 服务器 ID
     * @return SFTP 客户端
     * @throws Exception 借用失败时抛出异常
     */
    public SFTPClient borrowObject(Long serverId) throws Exception {
        SFTPClientFactory.setCurrentServerId(serverId);
        GenericObjectPool<SFTPClient> pool = getOrCreatePool(serverId);
        
        try {
            SFTPClient client = pool.borrowObject();
            log.debug("从连接池借用 SFTP 客户端: serverId={}, active={}, idle={}", 
                serverId, pool.getNumActive(), pool.getNumIdle());
            return client;
        } catch (Exception e) {
            log.error("借用 SFTP 客户端失败: serverId={}, error={}", serverId, e.getMessage());
            throw e;
        }
    }

    /**
     * 将 SFTP 客户端归还到连接池
     * @param serverId 服务器 ID
     * @param client SFTP 客户端
     */
    public void returnObject(Long serverId, SFTPClient client) {
        if (client == null) {
            return;
        }
        
        GenericObjectPool<SFTPClient> pool = pools.get(serverId);
        if (pool != null) {
            try {
                pool.returnObject(client);
                log.debug("归还 SFTP 客户端到连接池: serverId={}, active={}, idle={}", 
                    serverId, pool.getNumActive(), pool.getNumIdle());
            } catch (Exception e) {
                log.warn("归还 SFTP 客户端失败: serverId={}, error={}", serverId, e.getMessage());
                try {
                    pool.invalidateObject(client);
                } catch (Exception ignored) {
                }
            }
        }
    }

    /**
     * 使 SFTP 客户端失效
     * @param serverId 服务器 ID
     * @param client SFTP 客户端
     */
    public void invalidateObject(Long serverId, SFTPClient client) {
        if (client == null) {
            return;
        }
        
        GenericObjectPool<SFTPClient> pool = pools.get(serverId);
        if (pool != null) {
            try {
                pool.invalidateObject(client);
                log.debug("SFTP 客户端已失效: serverId={}", serverId);
            } catch (Exception e) {
                log.warn("使 SFTP 客户端失效失败: serverId={}, error={}", serverId, e.getMessage());
            }
        }
    }

    /**
     * 清除指定服务器的连接池
     * @param serverId 服务器 ID
     */
    public void clearPool(Long serverId) {
        GenericObjectPool<SFTPClient> pool = pools.remove(serverId);
        if (pool != null) {
            try {
                pool.close();
                log.info("已清除服务器连接池: serverId={}", serverId);
            } catch (Exception e) {
                log.warn("清除连接池失败: serverId={}, error={}", serverId, e.getMessage());
            }
        }
        SFTPClientFactory.clearServerCache(serverId);
    }

    /**
     * 清除所有连接池
     */
    public void clearAllPools() {
        pools.keySet().forEach(this::clearPool);
        log.info("已清除所有连接池");
    }

    /**
     * 获取连接池状态
     * @param serverId 服务器 ID
     * @return 连接池状态信息
     */
    public String getPoolStatus(Long serverId) {
        GenericObjectPool<SFTPClient> pool = pools.get(serverId);
        if (pool == null) {
            return "连接池不存在";
        }
        return String.format("活跃: %d, 空闲: %d, 最大: %d", 
            pool.getNumActive(), pool.getNumIdle(), pool.getMaxTotal());
    }
}

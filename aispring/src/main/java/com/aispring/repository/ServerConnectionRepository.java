package com.aispring.repository;

import com.aispring.entity.ServerConnection;
import com.aispring.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 服务器连接仓库
 */
@Repository
public interface ServerConnectionRepository extends JpaRepository<ServerConnection, Long> {

    /**
     * 根据用户查找服务器连接
     */
    List<ServerConnection> findByUser(User user);

    /**
     * 根据用户ID查找服务器连接
     */
    List<ServerConnection> findByUserId(Long userId);

    /**
     * 根据ID和用户ID查找服务器连接
     */
    ServerConnection findByIdAndUserId(Long id, Long userId);
}

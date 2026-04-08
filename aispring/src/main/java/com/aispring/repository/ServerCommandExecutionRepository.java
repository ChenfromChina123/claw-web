package com.aispring.repository;

import com.aispring.entity.ServerCommandExecution;
import com.aispring.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 服务器命令执行记录仓库
 */
@Repository
public interface ServerCommandExecutionRepository extends JpaRepository<ServerCommandExecution, Long> {

    /**
     * 根据用户查找命令执行记录
     */
    List<ServerCommandExecution> findByUser(User user);

    /**
     * 根据用户ID查找命令执行记录
     */
    List<ServerCommandExecution> findByUserId(Long userId);

    /**
     * 根据服务器ID查找命令执行记录
     */
    List<ServerCommandExecution> findByServerId(Long serverId);

    /**
     * 根据用户ID和服务器ID查找命令执行记录
     */
    List<ServerCommandExecution> findByUserIdAndServerId(Long userId, Long serverId);
}

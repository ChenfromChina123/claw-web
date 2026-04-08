package com.aispring.service.impl;

import com.aispring.entity.AgentFileSnapshot;
import com.aispring.repository.AgentFileSnapshotRepository;
import com.aispring.service.AgentFileSnapshotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Agent 文件快照服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AgentFileSnapshotServiceImpl implements AgentFileSnapshotService {

    private final AgentFileSnapshotRepository snapshotRepository;

    @Override
    @Transactional
    public AgentFileSnapshot createSnapshot(Long sessionId, Long taskId, String filePath, String snapshotType) {
        log.info("Creating snapshot for session: {}, file: {}", sessionId, filePath);

        AgentFileSnapshot snapshot = new AgentFileSnapshot();
        snapshot.setSessionId(sessionId);
        snapshot.setTaskId(taskId);
        snapshot.setFilePath(filePath);
        snapshot.setSnapshotType(snapshotType);

        return snapshotRepository.save(snapshot);
    }

    @Override
    @Transactional
    public AgentFileSnapshot createGitSnapshot(Long sessionId, Long taskId, String commitHash, String commitMessage) {
        log.info("Creating Git snapshot for session: {}, commit: {}", sessionId, commitHash);

        AgentFileSnapshot snapshot = new AgentFileSnapshot();
        snapshot.setSessionId(sessionId);
        snapshot.setTaskId(taskId);
        snapshot.setSnapshotType(AgentFileSnapshot.TYPE_PRE_OPERATION);
        snapshot.setCommitHash(commitHash);
        snapshot.setCommitMessage(commitMessage);

        return snapshotRepository.save(snapshot);
    }

    @Override
    public List<AgentFileSnapshot> getSnapshotsBySessionId(Long sessionId) {
        return snapshotRepository.findBySessionIdOrderByCreatedAtDesc(sessionId);
    }

    @Override
    public List<AgentFileSnapshot> getSnapshotsByTaskId(Long taskId) {
        return snapshotRepository.findByTaskIdOrderByCreatedAtDesc(taskId);
    }

    @Override
    public Optional<AgentFileSnapshot> getLatestSnapshot(Long sessionId, String filePath) {
        return snapshotRepository.findLatestSnapshotBySessionIdAndFilePath(sessionId, filePath);
    }

    @Override
    public Optional<AgentFileSnapshot> getLatestSnapshot(Long sessionId) {
        return snapshotRepository.findLatestSnapshotBySessionId(sessionId);
    }

    @Override
    public Optional<AgentFileSnapshot> getSnapshotByCommitHash(String commitHash) {
        return snapshotRepository.findByCommitHash(commitHash);
    }

    @Override
    @Transactional
    public void deleteSnapshotsBySessionId(Long sessionId) {
        log.info("Deleting all snapshots for session: {}", sessionId);
        snapshotRepository.deleteBySessionId(sessionId);
    }
}

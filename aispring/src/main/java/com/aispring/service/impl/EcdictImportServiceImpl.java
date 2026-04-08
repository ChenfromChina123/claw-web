package com.aispring.service.impl;

import com.aispring.entity.WordDict;
import com.aispring.repository.WordDictRepository;
import com.aispring.service.EcdictImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * ECDICT 词典库导入服务实现
 * 支持从 CSV/JSON 格式导入 300万+ 词库数据
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcdictImportServiceImpl implements EcdictImportService {

    private final WordDictRepository wordDictRepository;
    private final TransactionTemplate transactionTemplate;

    private static final String ECDICT_DOWNLOAD_URL = "http://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
    private static final int BATCH_SIZE = 1000;

    @Override
    public long downloadAndImport() {
        log.info("开始下载 ECDICT 词典库...");
        long startTime = System.currentTimeMillis();

        try {
            Path tempFile = Files.createTempFile("ecdict", ".csv");
            downloadFile(ECDICT_DOWNLOAD_URL, tempFile.toString());
            long imported = importFromFile(tempFile.toString());
            Files.deleteIfExists(tempFile);

            long duration = System.currentTimeMillis() - startTime;
            log.info("ECDICT 词典库导入完成！共导入 {} 条记录，耗时 {} 秒",
                    imported, duration / 1000);
            return imported;
        } catch (IOException e) {
            log.error("下载 ECDICT 词典库失败", e);
            throw new RuntimeException("下载 ECDICT 词典库失败", e);
        }
    }

    @Override
    public long importFromFile(String filePath) {
        log.info("开始从文件导入 ECDICT 词典库: {}", filePath);
        AtomicLong importedCount = new AtomicLong(0);
        AtomicLong batchCount = new AtomicLong(0);

        try (BufferedReader reader = new BufferedReader(new FileReader(filePath))) {
            String line;
            List<WordDict> batch = new ArrayList<>(BATCH_SIZE);

            reader.readLine();

            while ((line = reader.readLine()) != null) {
                WordDict word = parseCsvLine(line);
                if (word != null) {
                    batch.add(word);

                    if (batch.size() >= BATCH_SIZE) {
                        saveBatch(batch);
                        importedCount.addAndGet(batch.size());
                        batchCount.incrementAndGet();

                        if (batchCount.get() % 10 == 0) {
                            log.info("已导入 {} 条记录...", importedCount.get());
                        }

                        batch.clear();
                    }
                }
            }

            if (!batch.isEmpty()) {
                saveBatch(batch);
                importedCount.addAndGet(batch.size());
            }

            log.info("ECDICT 导入完成！总计导入 {} 条记录", importedCount.get());
            return importedCount.get();

        } catch (IOException e) {
            log.error("从文件导入 ECDICT 失败: {}", filePath, e);
            throw new RuntimeException("从文件导入 ECDICT 失败", e);
        }
    }

    @Override
    public long getWordCount() {
        return wordDictRepository.count();
    }

    @Override
    public boolean isImported() {
        return wordDictRepository.count() > 100000;
    }

    private void downloadFile(String url, String destPath) throws IOException {
        try (var inputStream = new java.net.URL(url).openStream();
             var outputStream = new java.io.FileOutputStream(destPath)) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            long totalBytes = 0;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
                totalBytes += bytesRead;
                if (totalBytes % (10 * 1024 * 1024) == 0) {
                    log.info("已下载 {} MB...", totalBytes / (1024 * 1024));
                }
            }
            log.info("下载完成，文件大小: {} MB", totalBytes / (1024 * 1024));
        }
    }

    private WordDict parseCsvLine(String line) {
        try {
            String[] parts = splitCsvLine(line);
            if (parts.length < 2) {
                return null;
            }

            String word = parts[0].trim();
            if (word.isEmpty() || word.length() > 100) {
                return null;
            }

            WordDict.WordDictBuilder builder = WordDict.builder()
                    .word(word);

            if (parts.length > 1 && !parts[1].isEmpty()) {
                builder.phonetic(parts[1]);
            }
            if (parts.length > 2 && !parts[2].isEmpty()) {
                builder.definition(parts[2]);
            }
            if (parts.length > 3 && !parts[3].isEmpty()) {
                builder.translation(parts[3]);
            }
            if (parts.length > 4 && !parts[4].isEmpty()) {
                builder.levelTags(parts[4]);
            }

            return builder.build();

        } catch (Exception e) {
            log.debug("解析 CSV 行失败: {}", line.substring(0, Math.min(50, line.length())));
            return null;
        }
    }

    private String[] splitCsvLine(String line) {
        List<String> result = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;

        for (char c : line.toCharArray()) {
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                result.add(current.toString());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        result.add(current.toString());

        return result.toArray(new String[0]);
    }

    private void saveBatch(List<WordDict> batch) {
        transactionTemplate.executeWithoutResult(status -> {
            try {
                wordDictRepository.saveAll(batch);
            } catch (Exception e) {
                for (WordDict word : batch) {
                    try {
                        wordDictRepository.save(word);
                    } catch (Exception ex) {
                        log.debug("保存单词失败: {}", word.getWord());
                    }
                }
            }
        });
    }
}

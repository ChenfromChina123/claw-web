package com.aispring.initializer;

import com.aispring.service.EcdictImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * ECDICT 词典库自动导入初始化器
 * 在应用启动时检测词库是否已导入，如未导入则自动下载并导入
 */
@Slf4j
@Component
@Order(100)
@RequiredArgsConstructor
public class EcdictDataInitializer implements ApplicationRunner {

    private final EcdictImportService ecdictImportService;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        log.info("========================================");
        log.info("检查 ECDICT 词库导入状态...");

        if (ecdictImportService.isImported()) {
            long count = ecdictImportService.getWordCount();
            log.info("ECDICT 词库已导入，当前总计: {} 条记录", count);
            log.info("========================================");
            return;
        }

        log.info("ECDICT 词库未导入或数据不完整，开始自动导入...");
        log.info("这将需要几分钟时间下载和导入 300万+ 词库数据...");

        try {
            long imported = ecdictImportService.downloadAndImport();
            log.info("ECDICT 词库自动导入完成！共导入 {} 条记录", imported);
        } catch (Exception e) {
            log.error("ECDICT 词库自动导入失败: {}", e.getMessage());
            log.warn("词库导入失败，应用将继续启动。用户可以稍后通过 API 手动导入。");
        }

        log.info("========================================");
    }
}

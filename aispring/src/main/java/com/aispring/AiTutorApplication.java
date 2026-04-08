package com.aispring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.scheduling.annotation.EnableAsync;
import com.aispring.service.CloudDiskService;
import com.aispring.service.UserService;
import com.aispring.service.impl.WordDictServiceImpl;
import com.aispring.entity.Admin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 智学云境 (AI LearnSphere) - Spring Boot启动类
 */
@SpringBootApplication(scanBasePackages = {"com.aispring", "com.example.aispring"})
@EntityScan(basePackages = "com.aispring.entity")
@EnableJpaRepositories(basePackages = "com.aispring.repository")
@EnableJpaAuditing
@EnableAsync
@EnableConfigurationProperties
public class AiTutorApplication {
    private static final Logger log = LoggerFactory.getLogger(AiTutorApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(AiTutorApplication.class, args);
        System.out.println("""
            
            ╔═══════════════════════════════════════════════════════════╗
            ║                                                           ║
            ║   🤖 智学云境 (AI LearnSphere) - Spring Boot启动成功！       ║
            ║                                                           ║
            ║   📚 API文档: http://localhost:5000/swagger-ui.html        ║
            ║   💻 管理后台: http://localhost:5000/admin                 ║
            ║                                                           ║
            ╚═══════════════════════════════════════════════════════════╝
            
        """);
    }

    @Bean
    @ConditionalOnProperty(name = "app.cloud-disk.migrate-on-startup", havingValue = "true")
    public CommandLineRunner cloudDiskMigrationRunner(CloudDiskService cloudDiskService) {
        return args -> cloudDiskService.migrateToUnifiedBase();
    }

    @Bean
    public CommandLineRunner adminSetupRunner(UserService userService) {
        return args -> {
            String adminEmail = "3301767269@qq.com";
            try {
                Admin admin = userService.setAsAdmin(adminEmail);
                log.info("管理员设置成功: {} (ID: {})", adminEmail, admin.getId());
            } catch (Exception e) {
                log.warn("设置管理员失败 (可能用户尚未注册): {}", e.getMessage());
            }
        };
    }

    @Bean
    public FlywayMigrationStrategy cleanMigrateStrategy() {
        return flyway -> {
            flyway.repair();
            flyway.migrate();
        };
    }

    /**
     * 应用启动后预加载高频单词到 Redis 缓存
     * 条件：仅当 Redis 可用时执行
     */
    @Bean
    @ConditionalOnProperty(name = "app.word-dict.preload-cache-on-startup", havingValue = "true", matchIfMissing = true)
    public CommandLineRunner preloadWordCacheRunner(WordDictServiceImpl wordDictService) {
        return args -> {
            log.info("开始预加载高频单词到 Redis 缓存...");
            try {
                wordDictService.preloadHighFrequencyWords();
                log.info("高频单词预加载完成");
            } catch (Exception e) {
                log.warn("预加载高频单词失败（可能 Redis 不可用）: {}", e.getMessage());
            }
        };
    }
}

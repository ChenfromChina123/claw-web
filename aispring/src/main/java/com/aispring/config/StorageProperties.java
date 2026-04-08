package com.aispring.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Component
@ConfigurationProperties(prefix = "app.storage")
public class StorageProperties {

    private String rootDir = "./";
    private String cloudDiskDir = "cloud_disk_storage";
    private String avatarsDir = "avatars";
    private String publicFilesDir = "public_files";

    public String getRootDir() { return rootDir; }
    public void setRootDir(String rootDir) { this.rootDir = rootDir; }
    public String getCloudDiskDir() { return cloudDiskDir; }
    public void setCloudDiskDir(String cloudDiskDir) { this.cloudDiskDir = cloudDiskDir; }
    public String getAvatarsDir() { return avatarsDir; }
    public void setAvatarsDir(String avatarsDir) { this.avatarsDir = avatarsDir; }
    public String getPublicFilesDir() { return publicFilesDir; }
    public void setPublicFilesDir(String publicFilesDir) { this.publicFilesDir = publicFilesDir; }

    /**
     * 判断是否为生产环境（用于未显式配置时的默认数据目录）
     */
    private boolean isProduction() {
        String profile = System.getProperty("spring.profiles.active", "");
        String appMode = System.getProperty("app.mode", "");
        return "prod".equalsIgnoreCase(profile) || "production".equalsIgnoreCase(appMode);
    }

    /**
     * 获取用户数据存储根目录的绝对路径。
     * 优先级：环境变量 APP_STORAGE_ROOT / APP_DATA_ROOT > 配置文件 app.storage.root-dir > 生产环境默认专用目录 > 当前工作目录。
     * 生产环境应通过配置或环境变量将目录设到项目外，避免用户数据与代码混在一起。
     */
    public Path getRootAbsolute() {
        String dir = null;
        // 1. 环境变量优先（部署时可单独指定，不依赖项目路径）
        String envRoot = System.getenv("APP_STORAGE_ROOT");
        if (envRoot == null || envRoot.trim().isEmpty()) {
            envRoot = System.getenv("APP_DATA_ROOT");
        }
        if (envRoot != null && !envRoot.trim().isEmpty()) {
            dir = envRoot.trim();
        }
        // 2. 使用配置文件中的 root-dir（如 application-prod 中的专用目录）
        if (dir == null && rootDir != null && !rootDir.trim().isEmpty()
                && !".".equals(rootDir.trim()) && !"./".equals(rootDir.trim())) {
            dir = rootDir.trim();
        }
        // 3. 生产环境且未配置时，使用默认专用目录（Linux 常见路径；Windows 需设 APP_STORAGE_ROOT）
        if (dir == null && isProduction()) {
            dir = "/data/aispring";
        }
        // 4. 开发或未配置时使用当前工作目录
        if (dir == null || dir.trim().isEmpty() || ".".equals(dir) || "./".equals(dir)) {
            dir = System.getProperty("user.dir", ".");
        }

        Path rootPath;
        Path rp = Paths.get(dir);
        rootPath = rp.isAbsolute()
                ? rp.normalize()
                : Paths.get(System.getProperty("user.dir")).resolve(rp).toAbsolutePath().normalize();
        try {
            if (!Files.exists(rootPath)) {
                Files.createDirectories(rootPath);
            }
        } catch (Exception ignore) {
            // 目录创建失败时仍返回路径，后续写入会再报错
        }
        return rootPath;
    }

    public String getCloudDiskAbsolute() {
        Path base = getRootAbsolute().resolve(cloudDiskDir).normalize();
        try { Files.createDirectories(base); } catch (Exception ignore) {}
        return base.toString();
    }

    public String getAvatarsAbsolute() {
        Path base = getRootAbsolute().resolve(avatarsDir).normalize();
        try { Files.createDirectories(base); } catch (Exception ignore) {}
        return base.toString();
    }

    public String getPublicFilesAbsolute() {
        Path base = getRootAbsolute().resolve(publicFilesDir).normalize();
        try { Files.createDirectories(base); } catch (Exception ignore) {}
        return base.toString();
    }
}

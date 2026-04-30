plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.example.claw_code_application"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.claw_code_application"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        
        // 后端服务基础URL（开发环境）
        buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    lint {
        checkReleaseBuilds = false
    }
    
    // 启用 BuildConfig
    buildFeatures {
        buildConfig = true
        compose = true
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    
    // Compose BOM (统一版本管理)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    // Compose Animation - 使用 BOM 统一版本管理
    implementation(libs.compose.animation)
    implementation(libs.compose.animation.core)

    // Navigation
    implementation(libs.navigation.compose)

    // Lifecycle & ViewModel
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.activity.compose)

    // Network - OkHttp + Retrofit + Kotlinx Serialization
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.kotlinx.serialization.json)
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")

    // DataStore (Token存储)
    implementation(libs.datastore.preferences)

    // Security - EncryptedSharedPreferences (敏感数据加密存储)
    implementation(libs.security.crypto)

    // Room 数据库 (本地缓存)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // 协程
    implementation(libs.coroutines.android)

    // 图片加载
    implementation(libs.coil.compose)

    // Accompanist (系统UI控制器)
    implementation(libs.accompanist.systemuicontroller)

    // Markdown渲染 - mikepenz (Material3 + 代码高亮)
    implementation(libs.markdown.renderer)
    implementation(libs.markdown.code)

    // MMKV - 腾讯高性能KV存储（比SharedPreferences快10~100倍）
    implementation(libs.mmkv)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}

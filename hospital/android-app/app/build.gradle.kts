import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: keystore.properties (storeFile, storePassword, keyAlias, keyPassword) is never
// committed. Looked for next to this project, then at $SCP_ANDROID_KEYSTORE, then in the
// administrator's add-ons folder on the server. See README.md.
val keystoreFile = listOfNotNull(
    rootProject.file("keystore.properties"),
    System.getenv("SCP_ANDROID_KEYSTORE")?.let { file(it) },
    file("F:/SCP-addons/android-keystore/keystore.properties"),
).firstOrNull { it.isFile }
val keystore = Properties().apply { keystoreFile?.inputStream()?.use { load(it) } }

android {
    namespace = "th.sichomphu.scpremote"
    compileSdk = 36

    defaultConfig {
        applicationId = "th.sichomphu.scpremote"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.recyclerview:recyclerview:1.4.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

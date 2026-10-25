plugins {
    id("com.android.application")
}

android {
    namespace = "com.tamanegininja.cursedchronicles"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tamanegininja.cursedchronicles"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the release APK installs straight away.
            // Swap in your own keystore before publishing anywhere.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        // keep the bundled web game uncompressed for fast WebView loading
        noCompress += listOf("js", "css", "html")
    }
}

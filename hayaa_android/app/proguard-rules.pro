# ProGuard / R8 rules for Hayaa Health Google Play Release

# Keep WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebChromeClient and WebViewClient custom implementations
-keep class com.hayaa.health.MainActivity$* { *; }

# Keep ViewBinding generated classes
-keep class com.hayaa.health.databinding.** { *; }

# Suppress common warnings
-dontwarn android.webkit.**
-dontwarn androidx.**

# WebView JS bridge ke methods reflectively call hote hain — inhe rakho.
-keepclassmembers class com.chesssikho.app.MainActivity$JsTts {
    public *;
}
-keepclassmembers class com.chesssikho.app.MainActivity$JsStore {
    public *;
}
-keepattributes JavascriptInterface

package com.chesssikho.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.HashMap;
import java.util.Locale;

/**
 * Chess Sikho — native Android shell.
 *
 * Poora app offline chalta hai: web assets (index.html + JS + CSS) APK ke andar
 * hain aur WebView me load hote hain. Do native bridges diye gaye hain:
 *
 *   AndroidTTS   — Hindi/Hinglish voice guide (WebView me Web Speech API nahi chalta)
 *   AndroidStore — progress/settings ka reliable storage (file:// origin par
 *                  WebView ka localStorage aksar block hota hai)
 *
 * Koi internet permission nahi maangi gayi hai.
 */
public class MainActivity extends Activity {

    private static final String TAG = "ChessSikho";
    private static final String START_URL = "file:///android_asset/index.html";
    private static final String PREFS_NAME = "chess_sikho_store";

    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSpeech = null;
    private Locale ttsLocale = new Locale("en", "IN");

    // ------------------------------------------------------------------ lifecycle

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Status bar ko app ke dark theme se match karo.
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0B0C11"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                    & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        webView.setBackgroundColor(Color.parseColor("#0B0C11"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl() == null ? "" : request.getUrl().toString();
                // Bahar ke links ko browser me bhejo, app ke andar nahi.
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        android.content.Intent i = new android.content.Intent(
                                android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                        startActivity(i);
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, cm.message() + " @" + cm.sourceId() + ":" + cm.lineNumber());
                return true;
            }
        });

        webView.addJavascriptInterface(new JsTts(), "AndroidTTS");
        webView.addJavascriptInterface(new JsStore(), "AndroidStore");
        webView.addJavascriptInterface(new JsApp(), "AndroidApp");

        if (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        initTts();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        stopSpeaking();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        stopSpeaking();
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) {
            }
            tts = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidTTS");
            webView.removeJavascriptInterface("AndroidStore");
            webView.removeJavascriptInterface("AndroidApp");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Manifest me configChanges declared hai — WebView reload nahi hoga.
    }

    /** Back press: pehle app ke andar ki history, phir exit. */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        // Home view par ho to dobara dabane par exit.
        super.onBackPressed();
    }

    // ------------------------------------------------------------------ TTS

    private void initTts() {
        try {
            tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (status != TextToSpeech.SUCCESS || tts == null) {
                        ttsReady = false;
                        Log.w(TAG, "TTS init failed: " + status);
                        return;
                    }
                    applyLocale(ttsLocale);
                    tts.setSpeechRate(1.0f);
                    tts.setPitch(1.0f);
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String utteranceId) { }
                        @Override public void onDone(String utteranceId) { }
                        @Override public void onError(String utteranceId) { }
                    });
                    ttsReady = true;
                    if (pendingSpeech != null) {
                        String text = pendingSpeech;
                        pendingSpeech = null;
                        speakNow(text);
                    }
                }
            });
        } catch (Exception e) {
            ttsReady = false;
            Log.w(TAG, "TTS unavailable", e);
        }
    }

    private int applyLocale(Locale locale) {
        if (tts == null) return TextToSpeech.ERROR;
        int result = tts.setLanguage(locale);
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            result = tts.setLanguage(new Locale("en", "IN"));
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                result = tts.setLanguage(Locale.getDefault());
            }
        }
        return result;
    }

    private void speakNow(String text) {
        if (tts == null || TextUtils.isEmpty(text)) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "chess-sikho-guide");
            } else {
                HashMap<String, String> params = new HashMap<String, String>();
                params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "chess-sikho-guide");
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, params);
            }
        } catch (Exception e) {
            Log.w(TAG, "speak failed", e);
        }
    }

    private void stopSpeaking() {
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) {
            }
        }
    }

    // ------------------------------------------------------------------ JS bridges

    /** window.AndroidTTS — voice guide. */
    public class JsTts {
        @JavascriptInterface
        public boolean isReady() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(String text) {
            if (TextUtils.isEmpty(text)) return;
            if (!ttsReady) {
                pendingSpeech = text;
                return;
            }
            speakNow(text);
        }

        /** Lambe guide ko tukdo me bolna — queue me add hota jaayega. */
        @JavascriptInterface
        public void speakQueue(String text) {
            if (TextUtils.isEmpty(text) || tts == null) return;
            if (!ttsReady) {
                pendingSpeech = text;
                return;
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    tts.speak(text, TextToSpeech.QUEUE_ADD, null, "chess-sikho-queue");
                } else {
                    HashMap<String, String> params = new HashMap<String, String>();
                    params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "chess-sikho-queue");
                    tts.speak(text, TextToSpeech.QUEUE_ADD, params);
                }
            } catch (Exception e) {
                Log.w(TAG, "speakQueue failed", e);
            }
        }

        @JavascriptInterface
        public void stop() {
            stopSpeaking();
        }

        /** Language tag: "hi-IN", "en-IN", "en" ... */
        @JavascriptInterface
        public boolean setLang(String tag) {
            if (TextUtils.isEmpty(tag) || tts == null) return false;
            Locale locale;
            try {
                String[] parts = tag.replace('_', '-').split("-");
                locale = parts.length > 1 ? new Locale(parts[0], parts[1]) : new Locale(parts[0]);
            } catch (Exception e) {
                return false;
            }
            ttsLocale = locale;
            int r = applyLocale(locale);
            return r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
        }

        @JavascriptInterface
        public void setRate(float rate) {
            if (tts != null) tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
        }

        @JavascriptInterface
        public String currentLang() {
            return ttsLocale.getLanguage() + "-" + ttsLocale.getCountry();
        }
    }

    /** window.AndroidStore — SharedPreferences backed key/value storage. */
    public class JsStore {
        private SharedPreferences prefs() {
            return getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            return prefs().getString(key, null);
        }

        @JavascriptInterface
        public void set(String key, String value) {
            prefs().edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void remove(String key) {
            prefs().edit().remove(key).apply();
        }

        @JavascriptInterface
        public boolean available() {
            return true;
        }
    }

    /** window.AndroidApp — chhote native helpers. */
    public class JsApp {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager()
                        .getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        /** Screen on rakho (game ke dauraan). */
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (on) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(long millis) {
            try {
                android.os.Vibrator v =
                        (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) v.vibrate(Math.max(0, Math.min(400, millis)));
            } catch (Exception ignored) {
            }
        }
    }
}

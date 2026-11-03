package com.ashwoodfriends.dalbitsaju;

import android.content.SharedPreferences;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        SharedPreferences preferences = getSharedPreferences("web-release", MODE_PRIVATE);
        if (!preferences.getBoolean("ongi-cache-reset", false)) {
            WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
            webView.clearCache(true);
            preferences.edit().putBoolean("ongi-cache-reset", true).apply();
        }
        super.load();
    }
}

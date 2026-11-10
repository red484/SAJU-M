package com.ashwoodfriends.ongi;

import android.content.SharedPreferences;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.browser.auth.AuthTabIntent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

public class MainActivity extends BridgeActivity {
    private ActivityResultLauncher<Intent> authLauncher;
    private PluginCall authCall;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OngiAuthPlugin.class);
        super.onCreate(savedInstanceState);
        authLauncher = AuthTabIntent.registerActivityResultLauncher(this, result -> {
            if (authCall == null) return;
            JSObject data = new JSObject();
            data.put("completed", result.resultCode == AuthTabIntent.RESULT_OK);
            authCall.resolve(data);
            authCall = null;
        });
    }

    void openAuthTab(Uri url, PluginCall call) {
        if (authCall != null) { call.reject("이미 로그인이 진행 중이에요."); return; }
        if (!"https".equals(url.getScheme()) || !"saju.ashwoodfriends.com".equals(url.getHost()) || url.getUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443) || !"/api/auth/native/start".equals(url.getPath())) {
            call.reject("로그인 주소를 확인하지 못했어요."); return;
        }
        authCall = call;
        try { new AuthTabIntent.Builder().build().launch(authLauncher, url, "ongiauth"); }
        catch (Exception error) { authCall = null; call.reject("브라우저를 열지 못했어요."); }
    }
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

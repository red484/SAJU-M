package com.ashwoodfriends.ongi;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OngiAuth")
public class OngiAuthPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("로그인 주소를 확인하지 못했어요."); return; }
        ((MainActivity) getActivity()).openAuthTab(Uri.parse(url), call);
    }
}

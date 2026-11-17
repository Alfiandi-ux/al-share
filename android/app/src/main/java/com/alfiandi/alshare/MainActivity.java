package com.alfiandi.alshare;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int PERMISSION_REQ_CODE = 2001;
    private static final int FILE_CHOOSER_REQ_CODE = 2002;

    private TextView tvServerUrl;
    private View statusIndicator;
    private Button btnCopy;
    private Button btnBrowser;
    private Button btnConnect;
    private SwipeRefreshLayout swipeRefresh;
    private WebView webView;

    private AlShareService alShareService;
    private boolean isServiceBound = false;
    private ValueCallback<Uri[]> uploadMessage;
    private String currentServerUrl = "http://127.0.0.1:8080";

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            AlShareService.LocalBinder binder = (AlShareService.LocalBinder) service;
            alShareService = binder.getService();
            isServiceBound = true;
            updateServerInfo();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            isServiceBound = false;
            alShareService = null;
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvServerUrl = findViewById(R.id.tvServerUrl);
        statusIndicator = findViewById(R.id.statusIndicator);
        btnCopy = findViewById(R.id.btnCopy);
        btnBrowser = findViewById(R.id.btnBrowser);
        btnConnect = findViewById(R.id.btnConnect);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        setupWebView();
        setupListeners();
        checkAndRequestPermissions();
        startAndBindService();
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Keep local / in-app browsing inside webview, external domains can open outside
                if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost") ||
                    url.startsWith("http://192.168.") || url.startsWith("http://10.") || url.startsWith("http://172.")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipeRefresh.setRefreshing(false);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(intent, "Pilih Berkas untuk Diunggah"), FILE_CHOOSER_REQ_CODE);
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        swipeRefresh.setOnRefreshListener(() -> webView.reload());
    }

    private void setupListeners() {
        btnCopy.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newPlainText("Al-share URL", currentServerUrl);
            if (cm != null) {
                cm.setPrimaryClip(clip);
                Toast.makeText(this, getString(R.string.copied), Toast.LENGTH_SHORT).show();
            }
        });

        btnBrowser.setOnClickListener(v -> {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(currentServerUrl));
                startActivity(browserIntent);
            } catch (Exception e) {
                Toast.makeText(this, "Tidak ada aplikasi browser yang tersedia", Toast.LENGTH_SHORT).show();
            }
        });

        btnConnect.setOnClickListener(v -> showConnectDialog());
    }

    private void showConnectDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Hubungkan ke Perangkat Lain");
        builder.setMessage("Masukkan alamat IP Al-share dari perangkat lain:");

        final EditText input = new EditText(this);
        input.setHint("contoh: 192.168.1.5:8080");
        input.setSingleLine(true);
        builder.setView(input);

        builder.setPositiveButton("Buka", (dialog, which) -> {
            String target = input.getText().toString().trim();
            if (!target.isEmpty()) {
                if (!target.startsWith("http://") && !target.startsWith("https://")) {
                    target = "http://" + target;
                }
                tvServerUrl.setText(target);
                webView.loadUrl(target);
            }
        });

        builder.setNegativeButton("Kembali ke Server Lokal", (dialog, which) -> {
            updateServerInfo();
        });

        builder.show();
    }

    private void updateServerInfo() {
        int port = 8080;
        if (alShareService != null) {
            port = alShareService.getPort();
        }
        String ip = NetworkUtils.getPrimaryIp();
        currentServerUrl = "http://" + ip + ":" + port;
        tvServerUrl.setText(currentServerUrl);
        statusIndicator.setBackgroundColor(0xFF00C853);

        // Load into webView
        String localUrl = "http://127.0.0.1:" + port;
        webView.loadUrl(localUrl);
    }

    private void startAndBindService() {
        Intent serviceIntent = new Intent(this, AlShareService.class);
        serviceIntent.setAction(AlShareService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        bindService(serviceIntent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void checkAndRequestPermissions() {
        List<String> needed = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ_CODE) {
            if (uploadMessage == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            uploadMessage.onReceiveValue(results);
            uploadMessage = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (isServiceBound) {
            unbindService(serviceConnection);
            isServiceBound = false;
        }
        super.onDestroy();
    }
}

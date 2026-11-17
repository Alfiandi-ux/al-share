package com.alfiandi.alshare;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

public class AlShareService extends Service {
    public static final String ACTION_STOP = "com.alfiandi.alshare.ACTION_STOP";
    public static final String ACTION_START = "com.alfiandi.alshare.ACTION_START";
    public static final String CHANNEL_ID = "alshare_service_channel";
    public static final int NOTIFICATION_ID = 1001;

    private final IBinder binder = new LocalBinder();
    private HttpServer httpServer;
    private StorageManager storageManager;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private int currentPort = 8080;

    public class LocalBinder extends Binder {
        public AlShareService getService() {
            return AlShareService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        storageManager = new StorageManager(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopServer();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        startServer();
        startForeground(NOTIFICATION_ID, buildNotification());
        return START_STICKY;
    }

    public synchronized void startServer() {
        if (httpServer != null && httpServer.isRunning()) return;

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AlShare:WakeLock");
                wakeLock.acquire(12 * 60 * 60 * 1000L); // Max 12 hours
            }

            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wifiLock == null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "AlShare:WifiLock");
                wifiLock.acquire();
            }

            // Find an open port starting at 8080
            int port = 8080;
            boolean started = false;
            for (int p = 8080; p < 8090; p++) {
                try {
                    httpServer = new HttpServer(this, storageManager, p);
                    httpServer.start();
                    currentPort = p;
                    started = true;
                    break;
                } catch (Exception e) {
                    // Try next port
                }
            }
            if (!started) {
                currentPort = 8080;
            }
        } catch (Exception ignored) {
        }
    }

    public synchronized void stopServer() {
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try { wifiLock.release(); } catch (Exception ignored) {}
            wifiLock = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
            wakeLock = null;
        }
    }

    public int getPort() {
        return currentPort;
    }

    public boolean isServerRunning() {
        return httpServer != null && httpServer.isRunning();
    }

    public StorageManager getStorageManager() {
        return storageManager;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.channel_name),
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(getString(R.string.channel_desc));
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        String ip = NetworkUtils.getPrimaryIp();
        String url = "http://" + ip + ":" + currentPort;

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent piOpen = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        Intent stopIntent = new Intent(this, AlShareService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent piStop = PendingIntent.getService(this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(getString(R.string.server_running))
                .setContentText(url)
                .setContentIntent(piOpen)
                .addAction(android.R.drawable.ic_menu_view, getString(R.string.action_open), piOpen)
                .addAction(android.R.drawable.ic_delete, getString(R.string.stop), piStop)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        stopServer();
        super.onDestroy();
    }
}

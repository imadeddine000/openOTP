package com.otpsystem.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.telephony.SmsManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Foreground service that polls the gateway server for pending outbound SMS
 * every 15 seconds, sends them via SmsManager, and sends a heartbeat every
 * 30 seconds. Pull-based REST only -- no sockets.
 */
public class SmsPollService extends Service {

    private static final String TAG = "SmsPollService";
    private static final String CHANNEL_ID = "otp_gateway_channel";
    private static final int NOTIFICATION_ID = 2;
    private static final String PREFS = "otp_prefs";
    private static final long POLL_INTERVAL_MS = 15000L;
    private static final long HEARTBEAT_INTERVAL_MS = 30000L;
    private static final int CLAIM_LIMIT = 25;

    public static final String ACTION_SMS_SENT = "com.otpsystem.app.SMS_SENT";
    public static final String ACTION_SMS_DELIVERED = "com.otpsystem.app.SMS_DELIVERED";

    private HandlerThread handlerThread;
    private Handler handler;
    private volatile boolean running = false;
    private long lastHeartbeat = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handlerThread = new HandlerThread("SmsPollService");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
        Log.i(TAG, "SmsPollService created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundCompat();
        if (!running) {
            running = true;
            lastHeartbeat = 0L;
            handler.post(pollRunnable);
        }
        return START_STICKY;
    }

    private void startForegroundCompat() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            try {
                pollOnce();
            } catch (Exception e) {
                Log.e(TAG, "poll error", e);
            }
            if (running) {
                handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        }
    };

    private void pollOnce() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("serverUrl", null);
        String deviceId = prefs.getString("deviceId", null);
        String apiKey = prefs.getString("apiKey", null);
        if (serverUrl == null || deviceId == null || apiKey == null
                || serverUrl.isEmpty() || deviceId.isEmpty() || apiKey.isEmpty()) {
            Log.w(TAG, "Missing config, skipping poll");
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            GatewayClient.heartbeat(serverUrl, deviceId, apiKey);
            lastHeartbeat = now;
        }

        JSONArray messages = GatewayClient.claimMessages(serverUrl, deviceId, apiKey, CLAIM_LIMIT);
        if (messages == null || messages.length() == 0) {
            return;
        }
        for (int i = 0; i < messages.length(); i++) {
            try {
                JSONObject msg = messages.getJSONObject(i);
                sendOne(serverUrl, deviceId, apiKey, msg);
            } catch (Exception e) {
                Log.e(TAG, "message parse/send error", e);
            }
        }
    }

    private void sendOne(String serverUrl, String deviceId, String apiKey, JSONObject msg) {
        String smsId = msg.optString("smsId", "");
        String recipient = msg.optString("recipient", "");
        String message = msg.optString("message", "");
        if (smsId.isEmpty() || recipient.isEmpty()) {
            Log.w(TAG, "Claimed message missing smsId/recipient: " + msg);
            return;
        }

        Intent sentIntent = new Intent(ACTION_SMS_SENT);
        sentIntent.setPackage(getPackageName());
        sentIntent.putExtra("smsId", smsId);
        sentIntent.putExtra("deviceId", deviceId);
        sentIntent.putExtra("serverUrl", serverUrl);
        sentIntent.putExtra("apiKey", apiKey);
        sentIntent.putExtra("recipient", recipient);

        Intent deliveredIntent = new Intent(ACTION_SMS_DELIVERED);
        deliveredIntent.setPackage(getPackageName());
        deliveredIntent.putExtra("smsId", smsId);
        deliveredIntent.putExtra("deviceId", deviceId);
        deliveredIntent.putExtra("serverUrl", serverUrl);
        deliveredIntent.putExtra("apiKey", apiKey);
        deliveredIntent.putExtra("recipient", recipient);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent sentPI = PendingIntent.getBroadcast(this, 0, sentIntent, piFlags);
        PendingIntent deliveredPI = PendingIntent.getBroadcast(this, 0, deliveredIntent, piFlags);

        try {
            SmsManager sms = SmsManager.getDefault();
            sms.sendTextMessage(recipient, null, message, sentPI, deliveredPI);
            Log.i(TAG, "Sent SMS id=" + smsId + " to " + recipient);
        } catch (Exception e) {
            Log.e(TAG, "SmsManager threw for id=" + smsId, e);
            GatewayClient.updateSmsStatus(serverUrl, deviceId, apiKey, smsId,
                    "failed", 0L, 0L, System.currentTimeMillis(),
                    "SEND_FAILED", e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (handler != null) {
            handler.removeCallbacks(pollRunnable);
        }
        if (handlerThread != null) {
            handlerThread.quitSafely();
        }
        Log.i(TAG, "SmsPollService destroyed");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "openOTP Gateway", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("openOTP gateway running");
            NotificationManager manager = (NotificationManager)
                    getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("openOTP Gateway")
                .setContentText("openOTP gateway running")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }
}

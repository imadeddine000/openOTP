package com.otpsystem.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "OTP-Main";
    private static final String SERVER_URL = "http://10.0.2.2:3000";
    private static final String PREFS = "otp_prefs";
    private static final int DEFAULT_HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds

    private EditText etServerUrl, etDeviceId;
    private Switch swAutoConnect;
    private Button btnConnect, btnDisconnect, btnTestSms, btnSaveSettings, btnPing;
    private TextView tvStatus, tvLog, tvHeartbeat;

    private Socket mSocket;
    private boolean isConnected = false;
    private String deviceId;
    private SharedPreferences prefs;

    // Heartbeat timer — emits `heartbeat` to server every heartbeatIntervalMs
    private final Handler heartbeatHandler = new Handler(Looper.getMainLooper());
    private long lastHeartbeatAckTime = 0;
    private int heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;

    private final ActivityResultLauncher<String[]> smsPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
            Boolean granted = result.get(Manifest.permission.SEND_SMS);
            if (granted != null && granted) {
                log("SMS permission granted");
            } else {
                log("SMS permission DENIED — OTP sending will fail");
            }
        });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        initViews();
        loadSettings();
        requestSmsPermission();
        updateButtonState();

        if (swAutoConnect.isChecked()) {
            btnConnect.performClick();
        }
    }

    private void initViews() {
        etServerUrl = findViewById(R.id.etServerUrl);
        etDeviceId = findViewById(R.id.etDeviceId);
        swAutoConnect = findViewById(R.id.swAutoConnect);
        btnConnect = findViewById(R.id.btnConnect);
        btnDisconnect = findViewById(R.id.btnDisconnect);
        btnTestSms = findViewById(R.id.btnTestSms);
        btnSaveSettings = findViewById(R.id.btnSaveSettings);
        btnPing = findViewById(R.id.btnPing);
        tvStatus = findViewById(R.id.tvStatus);
        tvLog = findViewById(R.id.tvLog);
        tvHeartbeat = findViewById(R.id.tvHeartbeat);
        tvLog.setMovementMethod(new ScrollingMovementMethod());

        btnConnect.setOnClickListener(v -> doConnect());
        btnDisconnect.setOnClickListener(v -> doDisconnect());
        btnTestSms.setOnClickListener(v -> doTestSms());
        btnPing.setOnClickListener(v -> doPingServer());
        btnSaveSettings.setOnClickListener(v -> {
            saveSettings();
            Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show();
            log("Settings saved (server: " + etServerUrl.getText() + ")");
        });
    }

    private void loadSettings() {
        etServerUrl.setText(prefs.getString("serverUrl", SERVER_URL));
        // Build.SERIAL is deprecated (API 26+) and returns "unknown" on Android 10+.
        // Use Settings.Secure.ANDROID_ID which is a stable per-device hex string.
        String androidId = android.provider.Settings.Secure.getString(
            getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        if (androidId == null || androidId.isEmpty()) androidId = "unknown";
        String defaultDeviceId = "android-" + androidId;
        etDeviceId.setText(prefs.getString("deviceId", defaultDeviceId));
        swAutoConnect.setChecked(prefs.getBoolean("autoConnect", false));
    }

    private void saveSettings() {
        prefs.edit()
            .putString("serverUrl", etServerUrl.getText().toString())
            .putString("deviceId", etDeviceId.getText().toString())
            .putBoolean("autoConnect", swAutoConnect.isChecked())
            .apply();
    }

    private void requestSmsPermission() {
        // Collect all needed permissions and request them in a SINGLE launch() call.
        // Calling launch() twice in a row on the same launcher can throw IllegalStateException.
        java.util.List<String> needed = new java.util.ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.SEND_SMS);
        }
        // POST_NOTIFICATIONS for Android 13+ (needed for foreground service notification)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!needed.isEmpty()) {
            smsPermissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    private void doConnect() {
        String url = etServerUrl.getText().toString().trim();
        deviceId = etDeviceId.getText().toString().trim();

        if (url.isEmpty() || deviceId.isEmpty()) {
            Toast.makeText(this, "Server URL and Device ID required", Toast.LENGTH_SHORT).show();
            return;
        }

        saveSettings();

        try {
            IO.Options opts = IO.Options.builder()
                .setForceNew(true)
                .setReconnection(true)
                .setReconnectionAttempts(5)
                .setReconnectionDelay(2000)
                .build();
            mSocket = IO.socket(url, opts);
        } catch (Exception e) {
            Log.e(TAG, "Socket init error", e);
            log("Socket init error: " + e.getMessage());
            return;
        }

        mSocket.on(Socket.EVENT_CONNECT, onConnect);
        mSocket.on(Socket.EVENT_DISCONNECT, onDisconnect);
        mSocket.on(Socket.EVENT_CONNECT_ERROR, onConnectError);
        mSocket.on("send-sms", onOtpRequest);
        mSocket.on("heartbeat-ack", onHeartbeatAck);
        mSocket.on("heartbeat-config", onHeartbeatConfig);

        mSocket.connect();

        // Start foreground service to keep connection alive in background
        ContextCompat.startForegroundService(this, new Intent(this, DeviceService.class));

        setStatus("Connecting...");
        log("Connecting to " + url + " as " + deviceId);
    }

    private void doDisconnect() {
        stopHeartbeat();

        if (mSocket != null) {
            mSocket.disconnect();
            mSocket.off();
            mSocket = null;
        }
        isConnected = false;
        setStatus("Disconnected");
        updateButtonState();
        tvHeartbeat.setText("Heartbeat: —");
        tvHeartbeat.setTextColor(0xFF666666);
        log("Disconnected");

        // Stop foreground service
        stopService(new Intent(this, DeviceService.class));
    }

    private void doTestSms() {
        String testNumber = "5554";
        String testMsg = "Test OTP from " + (deviceId != null ? deviceId : "device");
        sendSms(testNumber, testMsg, "TEST");
    }
    /**
     * Network diagnostic — tests connectivity to the server step by step:
     * 1. Shows the phone's own local IP
     * 2. Tests raw TCP socket connection to host:port
     * 3. Tests HTTP GET to /api/health
     * 4. Tests Socket.io polling handshake
     * All on a background thread; results logged to the UI.
     */
    private void doPingServer() {
        final String urlStr = etServerUrl.getText().toString().trim();
        if (urlStr.isEmpty()) {
            log("❌ Server URL is empty — enter it first");
            return;
        }
        log("━━━ PING SERVER START ━━━");
        log("Target URL: " + urlStr);
        btnPing.setEnabled(false);
        new Thread(() -> {
            try {
                java.net.URL url = new java.net.URL(urlStr);
                final String host = url.getHost();
                final int port = url.getPort() > 0 ? url.getPort() : (url.getProtocol().equals("https") ? 443 : 80);
                String phoneIp = getPhoneIpAddress();
                runOnUiThread(() -> log("Phone IP: " + phoneIp));
                // --- TCP socket test ---
                runOnUiThread(() -> log("Testing TCP " + host + ":" + port + "..."));
                long tcpStart = System.currentTimeMillis();
                try (java.net.Socket socket = new java.net.Socket()) {
                    socket.connect(new java.net.InetSocketAddress(host, port), 5000);
                    long tcpMs = System.currentTimeMillis() - tcpStart;
                    runOnUiThread(() -> log("✅ TCP OK — " + tcpMs + "ms"));
                } catch (Exception e) {
                    long tcpMs = System.currentTimeMillis() - tcpStart;
                    runOnUiThread(() -> log("❌ TCP FAIL — " + e.getClass().getSimpleName() + ": " + e.getMessage() + " (" + tcpMs + "ms)"));
                }
                // --- HTTP GET /api/health ---
                runOnUiThread(() -> log("Testing HTTP /api/health..."));
                try {
                    okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                            .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                            .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS).build();
                    String healthUrl = urlStr.endsWith("/") ? urlStr + "api/health" : urlStr + "/api/health";
                    okhttp3.Request req = new okhttp3.Request.Builder().url(healthUrl).build();
                    long hStart = System.currentTimeMillis();
                    try (okhttp3.Response resp = client.newCall(req).execute()) {
                        long hMs = System.currentTimeMillis() - hStart;
                        String body = resp.body() != null ? resp.body().string() : "(no body)";
                        if (body.length() > 200) body = body.substring(0, 200) + "...";
                        final String fb = body;
                        runOnUiThread(() -> log("✅ HTTP " + resp.code() + " — " + hMs + "ms — " + fb));
                    }
                } catch (Exception e) {
                    runOnUiThread(() -> log("❌ HTTP FAIL — " + e.getClass().getSimpleName() + ": " + e.getMessage()));
                }
                // --- Socket.io polling handshake ---
                runOnUiThread(() -> log("Testing Socket.io polling..."));
                try {
                    okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                            .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                            .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS).build();
                    String sioUrl = (urlStr.endsWith("/") ? urlStr : urlStr + "/") + "socket.io/?EIO=4&transport=polling";
                    okhttp3.Request req = new okhttp3.Request.Builder().url(sioUrl).build();
                    long sStart = System.currentTimeMillis();
                    try (okhttp3.Response resp = client.newCall(req).execute()) {
                        long sMs = System.currentTimeMillis() - sStart;
                        String body = resp.body() != null ? resp.body().string() : "(no body)";
                        if (body.length() > 200) body = body.substring(0, 200) + "...";
                        final String fb = body;
                        runOnUiThread(() -> log("✅ Socket.io " + resp.code() + " — " + sMs + "ms — " + fb));
                    }
                } catch (Exception e) {
                    runOnUiThread(() -> log("❌ Socket.io FAIL — " + e.getClass().getSimpleName() + ": " + e.getMessage()));
                }
            } catch (Exception e) {
                runOnUiThread(() -> log("❌ URL parse error — " + e.getMessage()));
            } finally {
                runOnUiThread(() -> { log("━━━ PING SERVER END ━━━"); btnPing.setEnabled(true); });
            }
        }).start();
    }

    private String getPhoneIpAddress() {
        try {
            java.util.Enumeration<java.net.NetworkInterface> ifaces = java.net.NetworkInterface.getNetworkInterfaces();
            while (ifaces.hasMoreElements()) {
                java.net.NetworkInterface iface = ifaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                java.util.Enumeration<java.net.InetAddress> addrs = iface.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    java.net.InetAddress addr = addrs.nextElement();
                    if (addr instanceof java.net.Inet4Address) return addr.getHostAddress();
                }
            }
        } catch (Exception e) { return "unknown (" + e.getMessage() + ")"; }
        return "unknown";
    }



    private void sendSms(String phoneNumber, String message, String taskId) {
        try {
            SmsManager smsManager = SmsManager.getDefault();
            smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            log("SMS sent to " + phoneNumber + ": " + message);

            if (mSocket != null && isConnected) {
                JSONObject ack = new JSONObject();
                ack.put("taskId", taskId);
                ack.put("success", true);
                mSocket.emit("sms-result", ack);
            }
        } catch (Exception e) {
            Log.e(TAG, "SMS send error", e);
            log("SMS error: " + e.getMessage());

            if (mSocket != null && isConnected) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("taskId", taskId);
                    err.put("success", false);
                    err.put("error", e.getMessage());
                    mSocket.emit("sms-result", err);
                } catch (JSONException je) {
                    Log.e(TAG, "JSON error", je);
                }
            }
        }
    }

    // ==================== Socket Event Listeners ====================

    private Emitter.Listener onConnect = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            runOnUiThread(() -> {
                isConnected = true;
                setStatus("Connected to server");
                updateButtonState();
                log("WebSocket connected");

                // Register this device with the server
                if (mSocket != null) {
                    JSONObject reg = new JSONObject();
                    try {
                        reg.put("id", deviceId);
                        reg.put("model", android.os.Build.MODEL);
                    } catch (JSONException e) {
                        Log.e(TAG, "Registration JSON error", e);
                    }
                    mSocket.emit("device-register", reg);
                    log("Sent device registration: " + deviceId);
                }

                // Start sending periodic heartbeats
                startHeartbeat();
            });
        }
    };

    private Emitter.Listener onDisconnect = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            runOnUiThread(() -> {
                stopHeartbeat();
                isConnected = false;
                setStatus("Disconnected");
                updateButtonState();
                tvHeartbeat.setText("Heartbeat: —");
                tvHeartbeat.setTextColor(0xFF666666);
                log("WebSocket disconnected");
            });
        }
    };

    private Emitter.Listener onConnectError = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            runOnUiThread(() -> {
                stopHeartbeat();
                isConnected = false;
                setStatus("Connection error");
                updateButtonState();
                tvHeartbeat.setText("Heartbeat: —");
                tvHeartbeat.setTextColor(0xFF666666);
                String msg = (args.length > 0) ? args[0].toString() : "unknown";
                log("Connection error: " + msg);
            });
        }
    };

    private Emitter.Listener onOtpRequest = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            if (args.length == 0) return;
            JSONObject data = (JSONObject) args[0];
            try {
                String taskId = data.getString("taskId");
                String phone = data.getString("phone");
                String message = data.optString("message", "Your OTP code is: " +
                    String.format("%06d", new java.util.Random().nextInt(1000000)));

                log("OTP request received: " + taskId + " -> " + phone);
                sendSms(phone, message, taskId);
            } catch (JSONException e) {
                Log.e(TAG, "OTP request parse error", e);
                log("Error parsing OTP request: " + e.getMessage());
            }
        }
    };

    // Server acknowledges our heartbeat — update the UI
    private Emitter.Listener onHeartbeatAck = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            runOnUiThread(() -> {
                lastHeartbeatAckTime = System.currentTimeMillis();
                String timeStr = new SimpleDateFormat("HH:mm:ss",
                    Locale.getDefault()).format(new Date(lastHeartbeatAckTime));
                tvHeartbeat.setText("Heartbeat: ✓ " + timeStr);
                tvHeartbeat.setTextColor(0xFF2E7D32); // green
            });
        }
    };

    // Server pushes a new heartbeat interval — adjust our timer dynamically
    private Emitter.Listener onHeartbeatConfig = new Emitter.Listener() {
        @Override
        public void call(Object... args) {
            if (args.length == 0) return;
            try {
                JSONObject data = (JSONObject) args[0];
                int newInterval = data.optInt("interval", DEFAULT_HEARTBEAT_INTERVAL_MS);
                if (newInterval >= 5000 && newInterval <= 120000) {
                    heartbeatIntervalMs = newInterval;
                    log("Heartbeat interval updated to " + newInterval + "ms");
                    // Restart heartbeat with new interval if currently running
                    if (isConnected) {
                        startHeartbeat();
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "heartbeat-config parse error", e);
            }
        }
    };

    // ==================== Heartbeat Timer ====================

    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            if (mSocket != null && isConnected) {
                mSocket.emit("heartbeat");
            }
            heartbeatHandler.postDelayed(this, heartbeatIntervalMs);
        }
    };

    private void startHeartbeat() {
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
        // Send first heartbeat immediately, then every HEARTBEAT_INTERVAL_MS
        heartbeatHandler.post(heartbeatRunnable);
        tvHeartbeat.setText("Heartbeat: sending…");
        tvHeartbeat.setTextColor(0xFF666666);
    }

    private void stopHeartbeat() {
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
    }

    // ==================== Utility Methods ====================

    private void log(String message) {
        String timestamp = new java.text.SimpleDateFormat("HH:mm:ss",
            java.util.Locale.getDefault()).format(new java.util.Date());
        String line = "[" + timestamp + "] " + message + "\n";

        tvLog.append(line);

        // Auto-scroll to bottom.
        // getLayout() returns null before the TextView's first layout pass, so we
        // must guard against that — otherwise this throws NullPointerException and
        // crashes the app whenever log() is called before the view is rendered.
        if (tvLog.getLayout() != null) {
            final int scrollAmount = tvLog.getLayout().getLineTop(
                tvLog.getLineCount()) - tvLog.getHeight();
            if (scrollAmount > 0) {
                tvLog.scrollTo(0, scrollAmount);
            } else {
                tvLog.scrollTo(0, 0);
            }
        }

        Log.d(TAG, message);
    }

    private void setStatus(String status) {
        tvStatus.setText("Status: " + status);
    }

    private void updateButtonState() {
        if (isConnected) {
            btnConnect.setEnabled(false);
            btnDisconnect.setEnabled(true);
            btnTestSms.setEnabled(true);
        } else {
            btnConnect.setEnabled(true);
            btnDisconnect.setEnabled(false);
            btnTestSms.setEnabled(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopHeartbeat();
        if (mSocket != null) {
            mSocket.disconnect();
            mSocket.off(Socket.EVENT_CONNECT, onConnect);
            mSocket.off(Socket.EVENT_DISCONNECT, onDisconnect);
            mSocket.off(Socket.EVENT_CONNECT_ERROR, onConnectError);
            mSocket.off("send-sms", onOtpRequest);
            mSocket.off("heartbeat-ack", onHeartbeatAck);
            mSocket.off("heartbeat-config", onHeartbeatConfig);
        }
        saveSettings();
        Log.i(TAG, "MainActivity destroyed");
    }
}

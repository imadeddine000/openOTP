package com.otpsystem.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Switch;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Main UI for the openOTP SMS gateway. Lets the user enter the server URL and
 * API key, register the device, start/stop the polling service, and toggle
 * forwarding of received SMS.
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "OTP-Main";
    private static final String PREFS = "otp_prefs";

    private EditText etServerUrl, etApiKey;
    private Button btnConnect, btnDisconnect;
    private Switch swReceiveSms;
    private TextView tvDeviceId, tvStatus, tvLog;

    private SharedPreferences prefs;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
                boolean allGranted = true;
                for (Boolean v : result.values()) {
                    if (v == null || !v) {
                        allGranted = false;
                        break;
                    }
                }
                if (allGranted) {
                    log("Permissions granted");
                } else {
                    log("Some permissions DENIED — app may not work fully");
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        etServerUrl = findViewById(R.id.etServerUrl);
        etApiKey = findViewById(R.id.etApiKey);
        btnConnect = findViewById(R.id.btnConnect);
        btnDisconnect = findViewById(R.id.btnDisconnect);
        swReceiveSms = findViewById(R.id.swReceiveSms);
        tvDeviceId = findViewById(R.id.tvDeviceId);
        tvStatus = findViewById(R.id.tvStatus);
        tvLog = findViewById(R.id.tvLog);
        tvLog.setMovementMethod(new ScrollingMovementMethod());

        etServerUrl.setText(prefs.getString("serverUrl", ""));
        etApiKey.setText(prefs.getString("apiKey", ""));
        swReceiveSms.setChecked(prefs.getBoolean("receiveEnabled", false));
        String savedDeviceId = prefs.getString("deviceId", null);
        if (savedDeviceId != null && !savedDeviceId.isEmpty()) {
            tvDeviceId.setText("Device ID: " + savedDeviceId);
            btnConnect.setText("Reconnect");
        }

        requestPermissions();

        btnConnect.setOnClickListener(v -> onConnect());
        btnDisconnect.setOnClickListener(v -> onDisconnect());
        swReceiveSms.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.edit().putBoolean("receiveEnabled", isChecked).apply();
            log("Receive SMS " + (isChecked ? "enabled" : "disabled"));
        });
    }

    private void requestPermissions() {
        String[] perms = {
                Manifest.permission.SEND_SMS,
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.POST_NOTIFICATIONS
        };
        List<String> needed = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (!needed.isEmpty()) {
            permissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    private void onConnect() {
        final String serverUrl = etServerUrl.getText().toString().trim();
        final String apiKey = etApiKey.getText().toString().trim();
        if (serverUrl.isEmpty() || apiKey.isEmpty()) {
            log("Enter server URL and API key");
            return;
        }
        prefs.edit()
                .putString("serverUrl", serverUrl)
                .putString("apiKey", apiKey)
                .apply();

        final String existingDeviceId = prefs.getString("deviceId", null);
        final boolean reconnect = existingDeviceId != null && !existingDeviceId.isEmpty();
        log(reconnect ? "Reconnecting with existing device id..." : "Registering device...");

        setStatus("Connecting...");
        btnConnect.setEnabled(false);

        new Thread(() -> {
            String deviceId = reconnect ? existingDeviceId : null;
            if (deviceId == null) {
                JSONObject body = new JSONObject();
                try {
                    body.put("brand", Build.BRAND);
                    body.put("manufacturer", Build.MANUFACTURER);
                    body.put("model", Build.MODEL);
                    body.put("os", "android");
                    body.put("osVersion", Build.VERSION.RELEASE);
                    body.put("osApiLevel", Build.VERSION.SDK_INT);
                    body.put("appVersionName", getAppVersionName());
                } catch (Exception e) {
                    Log.e(TAG, "build body error", e);
                }
                deviceId = GatewayClient.registerDevice(serverUrl, apiKey, body);
            }
            final String finalDeviceId = deviceId;
            uiHandler.post(() -> {
                if (finalDeviceId == null || finalDeviceId.isEmpty()) {
                    log("Registration failed — check server URL and API key");
                    setStatus("Not connected");
                    btnConnect.setEnabled(true);
                    btnDisconnect.setEnabled(false);
                    return;
                }
                prefs.edit().putString("deviceId", finalDeviceId).apply();
                tvDeviceId.setText("Device ID: " + finalDeviceId);
                startService();
                log("Connected, device id=" + finalDeviceId);
                setStatus("Connected");
                btnConnect.setEnabled(false);
                btnDisconnect.setEnabled(true);
                btnConnect.setText("Reconnect");
            });
        }).start();
    }

    private void startService() {
        Intent intent = new Intent(this, SmsPollService.class);
        ContextCompat.startForegroundService(this, intent);
    }

    private void onDisconnect() {
        stopService(new Intent(this, SmsPollService.class));
        prefs.edit().remove("deviceId").apply();
        tvDeviceId.setText("Device ID: —");
        setStatus("Not connected");
        log("Disconnected, device id cleared");
        btnConnect.setEnabled(true);
        btnDisconnect.setEnabled(false);
        btnConnect.setText("Connect");
    }

    @SuppressWarnings("deprecation")
    private String getAppVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "unknown";
        }
    }

    private void log(String message) {
        uiHandler.post(() -> {
            String timestamp = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date());
            String line = "[" + timestamp + "] " + message + "\n";
            tvLog.append(line);
            if (tvLog.getLayout() != null) {
                int scrollAmount = tvLog.getLayout().getLineTop(tvLog.getLineCount()) - tvLog.getHeight();
                if (scrollAmount > 0) {
                    tvLog.scrollTo(0, scrollAmount);
                } else {
                    tvLog.scrollTo(0, 0);
                }
            }
            Log.d(TAG, message);
        });
    }

    private void setStatus(String status) {
        tvStatus.setText("Status: " + status);
    }
}

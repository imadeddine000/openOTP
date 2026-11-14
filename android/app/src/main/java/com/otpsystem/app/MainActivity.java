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
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
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
    private TextView tvDeviceId, tvStatus, tvLog, tvSimList;
    private TextView tvDetectHint, tvAboutVersion, tvAboutServer;
    private ScrollView pageGateway, pageSims, pageSettings;
    private LinearLayout tabGateway, tabSims, tabSettings;
    private ImageView tabGatewayIcon, tabSimsIcon, tabSettingsIcon;
    private TextView tabGatewayLabel, tabSimsLabel, tabSettingsLabel;
    private LinearLayout llDetectedSims, llManualSims;
    private EditText etSimName, etSimNumber, etSimCarrier, etSimSubId;
    private Spinner spinSimSlot;

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
                renderSims();
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
        tvSimList = findViewById(R.id.tvSimList);
        tvStatus = findViewById(R.id.tvStatus);
        tvLog = findViewById(R.id.tvLog);
        tvLog.setMovementMethod(new ScrollingMovementMethod());

        // --- tab bar + pages ---
        pageGateway = findViewById(R.id.pageGateway);
        pageSims = findViewById(R.id.pageSims);
        pageSettings = findViewById(R.id.pageSettings);
        tabGateway = findViewById(R.id.tabGateway);
        tabSims = findViewById(R.id.tabSims);
        tabSettings = findViewById(R.id.tabSettings);
        tabGatewayIcon = findViewById(R.id.tabGatewayIcon);
        tabSimsIcon = findViewById(R.id.tabSimsIcon);
        tabSettingsIcon = findViewById(R.id.tabSettingsIcon);
        tabGatewayLabel = findViewById(R.id.tabGatewayLabel);
        tabSimsLabel = findViewById(R.id.tabSimsLabel);
        tabSettingsLabel = findViewById(R.id.tabSettingsLabel);
        llDetectedSims = findViewById(R.id.llDetectedSims);
        llManualSims = findViewById(R.id.llManualSims);
        tvDetectHint = findViewById(R.id.tvDetectHint);
        etSimName = findViewById(R.id.etSimName);
        etSimNumber = findViewById(R.id.etSimNumber);
        etSimCarrier = findViewById(R.id.etSimCarrier);
        etSimSubId = findViewById(R.id.etSimSubId);
        spinSimSlot = findViewById(R.id.spinSimSlot);
        tvAboutVersion = findViewById(R.id.tvAboutVersion);
        tvAboutServer = findViewById(R.id.tvAboutServer);
        Integer[] slots = {0, 1};
        spinSimSlot.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, slots));
        findViewById(R.id.btnAddSim).setOnClickListener(v -> addSim());
        tabGateway.setOnClickListener(v -> showTab(0));
        tabSims.setOnClickListener(v -> showTab(1));
        tabSettings.setOnClickListener(v -> showTab(2));
        showTab(0);

        etServerUrl.setText(prefs.getString("serverUrl", ""));
        etApiKey.setText(prefs.getString("apiKey", ""));
        swReceiveSms.setChecked(prefs.getBoolean("receiveEnabled", false));
        String savedDeviceId = prefs.getString("deviceId", null);
        if (savedDeviceId != null && !savedDeviceId.isEmpty()) {
            tvDeviceId.setText("Device ID: " + savedDeviceId);
            btnConnect.setText("Reconnect");
        }

        requestPermissions();
        updateSimList();

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
                    body.put("simInfo", SimUtils.getSimInfo(this));
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
                updateSimList();
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
        tvStatus.setText(status);
        if (status.startsWith("Connected")) {
            tvStatus.setBackgroundResource(R.drawable.bg_chip_green);
            tvStatus.setTextColor(ContextCompat.getColor(this, R.color.chipGreenText));
        } else if (status.startsWith("Connecting")) {
            tvStatus.setBackgroundResource(R.drawable.bg_chip_orange);
            tvStatus.setTextColor(ContextCompat.getColor(this, R.color.chipOrangeText));
        } else {
            tvStatus.setBackgroundResource(R.drawable.bg_chip_red);
            tvStatus.setTextColor(ContextCompat.getColor(this, R.color.chipRedText));
        }
    }

    private void updateSimList() {
        if (tvSimList != null) tvSimList.setText(SimUtils.describe(this));
    }

    /* ---- tab navigation ---- */
    private void showTab(int idx) {
        if (pageGateway == null) return;
        pageGateway.setVisibility(idx == 0 ? View.VISIBLE : View.GONE);
        pageSims.setVisibility(idx == 1 ? View.VISIBLE : View.GONE);
        pageSettings.setVisibility(idx == 2 ? View.VISIBLE : View.GONE);
        tintTab(tabGatewayIcon, tabGatewayLabel, idx == 0);
        tintTab(tabSimsIcon, tabSimsLabel, idx == 1);
        tintTab(tabSettingsIcon, tabSettingsLabel, idx == 2);
        if (idx == 1) {
            ensurePhonePermission();
            renderSims();
        }
        if (idx == 2) renderAbout();
    }

    private void tintTab(ImageView icon, TextView label, boolean active) {
        int c = ContextCompat.getColor(this, active ? R.color.primary : R.color.textMuted);
        icon.setColorFilter(c);
        label.setTextColor(c);
    }

    /* ---- SIM cards page ---- */
    private void ensurePhonePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            tvDetectHint.setText("Phone permission not granted — SIM cards can't be detected automatically. Grant it, or register SIMs manually below.");
            permissionLauncher.launch(new String[]{Manifest.permission.READ_PHONE_STATE});
        } else {
            tvDetectHint.setText("SIM cards are read from the phone automatically.");
        }
    }

    private void renderSims() {
        if (llDetectedSims == null) return;
        llDetectedSims.removeAllViews();
        llManualSims.removeAllViews();
        updateSimList();
        JSONArray sims = SimUtils.getSimInfo(this).optJSONArray("sims");
        int detected = 0, manual = 0;
        if (sims != null) {
            for (int i = 0; i < sims.length(); i++) {
                JSONObject s = sims.optJSONObject(i);
                if (s == null) continue;
                boolean isManual = "manual".equals(s.optString("source"));
                if (isManual) manual++; else detected++;
                String title = s.optString("carrierName", "");
                if (title.isEmpty()) title = s.optString("displayName", "SIM");
                if (title.isEmpty()) title = "SIM";
                StringBuilder sub = new StringBuilder("Slot ").append(s.optInt("slotIndex", -1));
                if (!s.isNull("subscriptionId")) sub.append(" • Subscription ").append(s.optInt("subscriptionId"));
                String number = s.optString("number", "");
                if (!number.isEmpty()) sub.append('\n').append(number);
                addSimCard(isManual ? llManualSims : llDetectedSims, title, sub.toString(),
                        isManual ? "MANUAL" : "DETECTED",
                        isManual ? R.drawable.bg_chip_orange : R.drawable.bg_chip_green,
                        isManual ? R.color.chipOrangeText : R.color.chipGreenText,
                        isManual ? manual - 1 : -1);
            }
        }
        if (detected == 0) addEmptyText(llDetectedSims, "No SIM cards detected automatically.");
        if (manual == 0) addEmptyText(llManualSims, "None yet — add one below.");
    }

    private void addSimCard(LinearLayout parent, String title, String sub, String badge,
                            int badgeBgRes, int badgeTextRes, int deleteIndex) {
        View card = LayoutInflater.from(this).inflate(R.layout.item_sim, parent, false);
        ((TextView) card.findViewById(R.id.simTitle)).setText(title);
        ((TextView) card.findViewById(R.id.simSub)).setText(sub);
        TextView badgeView = card.findViewById(R.id.simBadge);
        badgeView.setText(badge);
        badgeView.setBackgroundResource(badgeBgRes);
        badgeView.setTextColor(ContextCompat.getColor(this, badgeTextRes));
        TextView del = card.findViewById(R.id.simDelete);
        if (deleteIndex >= 0) {
            del.setVisibility(View.VISIBLE);
            del.setOnClickListener(v -> deleteManualSim(deleteIndex));
        } else {
            del.setVisibility(View.GONE);
        }
        parent.addView(card);
    }

    private void addEmptyText(LinearLayout parent, String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(13);
        t.setTextColor(ContextCompat.getColor(this, R.color.textMuted));
        parent.addView(t, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private void addSim() {
        String name = etSimName.getText().toString().trim();
        String number = etSimNumber.getText().toString().trim();
        if (name.isEmpty() || number.isEmpty()) {
            log("Enter at least a name and a number for the SIM card");
            return;
        }
        try {
            JSONArray arr = SimUtils.loadManualSims(this);
            JSONObject o = new JSONObject();
            o.put("name", name);
            o.put("number", number);
            o.put("carrier", etSimCarrier.getText().toString().trim());
            o.put("slot", (Integer) spinSimSlot.getSelectedItem());
            String subIdStr = etSimSubId.getText().toString().trim();
            if (!subIdStr.isEmpty()) o.put("subId", Integer.parseInt(subIdStr));
            arr.put(o);
            SimUtils.saveManualSims(this, arr);
        } catch (Exception e) {
            Log.e(TAG, "add sim error", e);
            log("Could not save the SIM card");
            return;
        }
        etSimName.setText("");
        etSimNumber.setText("");
        etSimCarrier.setText("");
        etSimSubId.setText("");
        renderSims();
        log("SIM card added: " + name);
        pushSimInfo();
    }

    private void deleteManualSim(int index) {
        try {
            JSONArray arr = SimUtils.loadManualSims(this);
            if (index >= 0 && index < arr.length()) arr.remove(index);
            SimUtils.saveManualSims(this, arr);
        } catch (Exception e) {
            Log.e(TAG, "delete sim error", e);
            return;
        }
        renderSims();
        log("SIM card removed");
        pushSimInfo();
    }

    /** Push the current SIM list to the server immediately (don't wait for the next heartbeat). */
    private void pushSimInfo() {
        String serverUrl = prefs.getString("serverUrl", null);
        String deviceId = prefs.getString("deviceId", null);
        String apiKey = prefs.getString("apiKey", null);
        if (serverUrl == null || deviceId == null || apiKey == null
                || serverUrl.isEmpty() || deviceId.isEmpty() || apiKey.isEmpty()) return;
        new Thread(() -> GatewayClient.heartbeat(serverUrl, deviceId, apiKey, SimUtils.getSimInfo(this))).start();
    }

    private void renderAbout() {
        if (tvAboutVersion == null) return;
        tvAboutVersion.setText("openOTP Gateway v" + getAppVersionName());
        String serverUrl = prefs.getString("serverUrl", "");
        String deviceId = prefs.getString("deviceId", "");
        tvAboutServer.setText("Server: " + (serverUrl.isEmpty() ? "not configured" : serverUrl)
                + "\nDevice ID: " + (deviceId.isEmpty() ? "—" : deviceId));
    }
}

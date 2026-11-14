package com.otpsystem.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives the SENT and DELIVERED PendingIntents fired by {@link android.telephony.SmsManager}
 * and reports the resulting status back to the gateway server.
 */
public class SmsStatusReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsStatusReceiver";
    private static final String ACTION_SMS_SENT = "com.otpsystem.app.SMS_SENT";
    private static final String ACTION_SMS_DELIVERED = "com.otpsystem.app.SMS_DELIVERED";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String smsId = intent.getStringExtra("smsId");
        String deviceId = intent.getStringExtra("deviceId");
        String serverUrl = intent.getStringExtra("serverUrl");
        String apiKey = intent.getStringExtra("apiKey");

        if (smsId == null || deviceId == null || serverUrl == null || apiKey == null
                || smsId.isEmpty() || deviceId.isEmpty()
                || serverUrl.isEmpty() || apiKey.isEmpty()) {
            Log.w(TAG, "Status broadcast missing extras, action=" + action);
            return;
        }

        long now = System.currentTimeMillis();

        if (ACTION_SMS_SENT.equals(action)) {
            int rc = getResultCode();
            if (rc == Activity.RESULT_OK) {
                Log.i(TAG, "SMS sent ok id=" + smsId);
                new Thread(() -> GatewayClient.updateSmsStatus(serverUrl, deviceId, apiKey,
                        smsId, "sent", now, 0L, 0L, null, null)).start();
            } else {
                Log.w(TAG, "SMS send failed id=" + smsId + " rc=" + rc);
                new Thread(() -> GatewayClient.updateSmsStatus(serverUrl, deviceId, apiKey,
                        smsId, "failed", 0L, 0L, now,
                        "SEND_FAILED", "result code " + rc)).start();
            }
        } else if (ACTION_SMS_DELIVERED.equals(action)) {
            Log.i(TAG, "SMS delivered id=" + smsId);
            new Thread(() -> GatewayClient.updateSmsStatus(serverUrl, deviceId, apiKey,
                    smsId, "delivered", 0L, now, 0L, null, null)).start();
        }
    }
}

package com.otpsystem.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Receives incoming SMS (android.provider.Telephony.SMS_RECEIVED) and forwards
 * them to the gateway server via the receive-sms endpoint.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";
    private static final String PREFS = "otp_prefs";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String deviceId = prefs.getString("deviceId", null);
        String apiKey = prefs.getString("apiKey", null);
        String serverUrl = prefs.getString("serverUrl", null);
        boolean receiveEnabled = prefs.getBoolean("receiveEnabled", false);

        if (!receiveEnabled || deviceId == null || apiKey == null || serverUrl == null
                || deviceId.isEmpty() || apiKey.isEmpty() || serverUrl.isEmpty()) {
            return;
        }

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String sender = messages[0].getOriginatingAddress();
        long timestamp = messages[0].getTimestampMillis();
        for (SmsMessage m : messages) {
            body.append(m.getDisplayMessageBody());
        }
        String message = body.toString();
        String fingerprint = md5(sender + "|" + message + "|" + timestamp);

        Log.d(TAG, "Received SMS from " + sender + ": " + message);

        new Thread(() -> GatewayClient.receiveSms(serverUrl, deviceId, apiKey,
                sender, message, timestamp, fingerprint)).start();
    }

    private static String md5(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}

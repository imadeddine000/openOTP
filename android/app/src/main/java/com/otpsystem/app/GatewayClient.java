package com.otpsystem.app;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Static networking helper for the openOTP gateway REST API.
 * Uses only HttpURLConnection and org.json (both built into Android).
 * All methods are blocking and MUST be called off the main thread.
 */
public final class GatewayClient {

    private static final String TAG = "GatewayClient";
    private static final int TIMEOUT_MS = 15000;

    private GatewayClient() {
    }

    private static HttpURLConnection open(String method, String urlStr, String apiKey) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        if (apiKey != null && !apiKey.isEmpty()) {
            conn.setRequestProperty("x-api-key", apiKey);
        }
        return conn;
    }

    private static String writeAndRead(HttpURLConnection conn, String body) throws IOException {
        if (body != null) {
            conn.setDoOutput(true);
            byte[] bytes = body.getBytes("UTF-8");
            OutputStream os = conn.getOutputStream();
            try {
                os.write(bytes);
            } finally {
                os.close();
            }
        }
        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String response = readStream(is);
        Log.d(TAG, conn.getRequestMethod() + " " + conn.getURL() + " -> " + code);
        return response;
    }

    private static String readStream(InputStream is) {
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        } catch (IOException e) {
            Log.w(TAG, "readStream error", e);
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException ignored) {
                }
            }
        }
        return sb.toString();
    }

    private static String trimSlash(String s) {
        if (s == null) return "";
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }

    /**
     * POST {server}/gateway/devices
     * @return the device id parsed from data.id, or null on failure.
     */
    public static String registerDevice(String serverUrl, String apiKey, JSONObject body) {
        HttpURLConnection conn = null;
        try {
            conn = open("POST", trimSlash(serverUrl) + "/gateway/devices", apiKey);
            String resp = writeAndRead(conn, body.toString());
            JSONObject json = new JSONObject(resp);
            JSONObject data = json.getJSONObject("data");
            if (data.has("id") && !data.isNull("id")) {
                return data.get("id").toString();
            }
            return null;
        } catch (Exception e) {
            Log.e(TAG, "registerDevice failed", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * POST {server}/gateway/devices/{id}/messages/claim
     * @return the data array of claimed messages, or null on failure.
     */
    public static JSONArray claimMessages(String serverUrl, String deviceId, String apiKey, int limit) {
        HttpURLConnection conn = null;
        try {
            String url = trimSlash(serverUrl) + "/gateway/devices/" + deviceId + "/messages/claim";
            conn = open("POST", url, apiKey);
            JSONObject body = new JSONObject();
            body.put("limit", limit);
            String resp = writeAndRead(conn, body.toString());
            JSONObject json = new JSONObject(resp);
            return json.optJSONArray("data");
        } catch (Exception e) {
            Log.e(TAG, "claimMessages failed", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * PATCH {server}/gateway/devices/{id}/sms-status
     */
    public static void updateSmsStatus(String serverUrl, String deviceId, String apiKey,
                                       String smsId, String status,
                                       long sentAt, long deliveredAt, long failedAt,
                                       String errorCode, String errorMessage) {
        HttpURLConnection conn = null;
        try {
            String url = trimSlash(serverUrl) + "/gateway/devices/" + deviceId + "/sms-status";
            conn = open("PATCH", url, apiKey);
            JSONObject body = new JSONObject();
            body.put("smsId", smsId);
            body.put("status", status);
            body.put("sentAtInMillis", sentAt);
            body.put("deliveredAtInMillis", deliveredAt);
            body.put("failedAtInMillis", failedAt);
            if (errorCode != null) body.put("errorCode", errorCode);
            if (errorMessage != null) body.put("errorMessage", errorMessage);
            writeAndRead(conn, body.toString());
        } catch (Exception e) {
            Log.e(TAG, "updateSmsStatus failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * POST {server}/gateway/devices/{id}/receive-sms
     */
    public static void receiveSms(String serverUrl, String deviceId, String apiKey,
                                  String sender, String message, long receivedAt, String fingerprint) {
        HttpURLConnection conn = null;
        try {
            String url = trimSlash(serverUrl) + "/gateway/devices/" + deviceId + "/receive-sms";
            conn = open("POST", url, apiKey);
            JSONObject body = new JSONObject();
            body.put("sender", sender);
            body.put("message", message);
            body.put("receivedAtInMillis", receivedAt);
            body.put("fingerprint", fingerprint);
            writeAndRead(conn, body.toString());
        } catch (Exception e) {
            Log.e(TAG, "receiveSms failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * POST {server}/gateway/devices/{id}/heartbeat
     */
    public static void heartbeat(String serverUrl, String deviceId, String apiKey) {
        HttpURLConnection conn = null;
        try {
            String url = trimSlash(serverUrl) + "/gateway/devices/" + deviceId + "/heartbeat";
            conn = open("POST", url, apiKey);
            writeAndRead(conn, "{}");
        } catch (Exception e) {
            Log.e(TAG, "heartbeat failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

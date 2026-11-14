package com.otpsystem.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * Reads the device's SIM card information (SubscriptionManager) and reports it
 * as JSON for the gateway server + web dashboard. All methods are safe to call
 * from any thread and never throw.
 */
public final class SimUtils {

    private SimUtils() {
    }

    private static boolean hasPhoneStatePermission(Context ctx) {
        return ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * JSON shape: { sims: [ { slotIndex, subscriptionId, displayName, carrierName, number, countryIso, source } ] }
     * Combines SIMs detected via SubscriptionManager with any SIMs the user
     * registered manually in the app. Reported to the server on connect + heartbeat.
     */
    public static JSONObject getSimInfo(Context ctx) {
        JSONObject info = new JSONObject();
        JSONArray sims = new JSONArray();
        try {
            info.put("sims", sims);
            if (hasPhoneStatePermission(ctx)) {
                SubscriptionManager sm = (SubscriptionManager)
                        ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
                if (sm != null) {
                    List<SubscriptionInfo> list = sm.getActiveSubscriptionInfoList();
                    if (list != null) {
                        for (SubscriptionInfo si : list) {
                            JSONObject o = new JSONObject();
                            o.put("slotIndex", si.getSimSlotIndex());
                            o.put("subscriptionId", si.getSubscriptionId());
                            o.put("displayName", si.getDisplayName() != null ? si.getDisplayName().toString() : "");
                            o.put("carrierName", si.getCarrierName() != null ? si.getCarrierName().toString() : "");
                            o.put("number", si.getNumber() != null ? si.getNumber() : "");
                            o.put("countryIso", si.getCountryIso() != null ? si.getCountryIso() : "");
                            o.put("source", "detected");
                            sims.put(o);
                        }
                    }
                }
            }
            JSONArray manual = loadManualSims(ctx);
            for (int i = 0; i < manual.length(); i++) {
                JSONObject m = manual.optJSONObject(i);
                if (m == null) continue;
                JSONObject o = new JSONObject();
                o.put("slotIndex", m.optInt("slot", i));
                if (m.has("subId") && !m.isNull("subId")) o.put("subscriptionId", m.optInt("subId"));
                else o.put("subscriptionId", JSONObject.NULL);
                o.put("displayName", m.optString("name", "SIM"));
                o.put("carrierName", m.optString("carrier", ""));
                o.put("number", m.optString("number", ""));
                o.put("countryIso", "");
                o.put("source", "manual");
                sims.put(o);
            }
        } catch (Exception ignored) {
        }
        return info;
    }

    /** Manually registered SIMs, stored in prefs as a JSON array. */
    public static JSONArray loadManualSims(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences("otp_prefs", Context.MODE_PRIVATE);
        try {
            return new JSONArray(prefs.getString("manualSims", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static void saveManualSims(Context ctx, JSONArray arr) {
        ctx.getSharedPreferences("otp_prefs", Context.MODE_PRIVATE)
                .edit().putString("manualSims", arr.toString()).apply();
    }

    /** Resolve the subscription id installed in the given SIM slot, or null. */
    public static Integer subscriptionIdForSlot(Context ctx, int slotIndex) {
        try {
            if (!hasPhoneStatePermission(ctx)) return null;
            SubscriptionManager sm = (SubscriptionManager)
                    ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) return null;
            List<SubscriptionInfo> list = sm.getActiveSubscriptionInfoList();
            if (list == null) return null;
            for (SubscriptionInfo si : list) {
                if (si.getSimSlotIndex() == slotIndex) return si.getSubscriptionId();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** Human-readable one-line-per-SIM summary for the app UI. */
    public static String describe(Context ctx) {
        try {
            JSONArray sims = getSimInfo(ctx).optJSONArray("sims");
            if (sims == null || sims.length() == 0) return "No SIM cards detected";
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < sims.length(); i++) {
                JSONObject s = sims.getJSONObject(i);
                if (i > 0) sb.append('\n');
                String carrier = s.optString("carrierName", "");
                if (carrier.isEmpty()) carrier = s.optString("displayName", "Unknown");
                String number = s.optString("number", "");
                sb.append("SIM ").append(s.optInt("slotIndex", i))
                        .append(": ").append(carrier.isEmpty() ? "Unknown" : carrier)
                        .append(number.isEmpty() ? "" : (" (" + number + ")"))
                        .append(" [").append(s.optString("source", "detected")).append(']');
            }
            return sb.toString();
        } catch (Exception e) {
            return "No SIM cards detected";
        }
    }
}

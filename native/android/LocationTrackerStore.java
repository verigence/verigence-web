package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * What the phone keeps for its location tracking (product owner, 2026-11-16):
 * the day's tracking key and where to send, and the readings not sent yet.
 * Kept in the app's private storage, so it survives the app being closed and
 * the phone restarting. Readings older than 48 hours are dropped (the server
 * refuses them).
 */
final class LocationTrackerStore {
    static final String PREFS = "vg_location_tracker";
    private static final String QUEUE = "queue";
    private static final int MAX_QUEUE = 300;
    private static final long MAX_AGE_MS = 48L * 60 * 60 * 1000;

    private final SharedPreferences prefs;

    LocationTrackerStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void saveSession(String baseUrl, String path, String key, long trackingUntilMs, int intervalMinutes,
                     int windowFromMinute, int windowToMinute) {
        prefs.edit()
            .putBoolean("active", true)
            .putString("baseUrl", baseUrl)
            .putString("path", path)
            .putString("key", key)
            .putLong("trackingUntilMs", trackingUntilMs)
            .putInt("intervalMinutes", intervalMinutes)
            .putInt("windowFromMinute", windowFromMinute)
            .putInt("windowToMinute", windowToMinute)
            .apply();
    }

    /** Stop reading; the key stays so readings already kept can still be sent. */
    void endTracking() {
        prefs.edit().putBoolean("active", false).apply();
    }

    /** The key is no longer accepted: nothing more can be sent with it. */
    void forgetKey() {
        prefs.edit().putBoolean("active", false).remove("key").remove(QUEUE).apply();
    }

    boolean isActive(long now) {
        return prefs.getBoolean("active", false) && prefs.getString("key", null) != null
            && now < trackingUntilMs();
    }

    boolean hasKey() { return prefs.getString("key", null) != null; }
    String baseUrl() { return prefs.getString("baseUrl", ""); }
    String path() { return prefs.getString("path", ""); }
    String key() { return prefs.getString("key", null); }
    long trackingUntilMs() { return prefs.getLong("trackingUntilMs", 0L); }
    int intervalMinutes() { return Math.max(5, prefs.getInt("intervalMinutes", 20)); }
    int windowFromMinute() { return prefs.getInt("windowFromMinute", 10 * 60); }
    int windowToMinute() { return prefs.getInt("windowToMinute", 19 * 60 + 30); }
    long lastReadingMs() { return prefs.getLong("lastReadingMs", 0L); }
    long lastSentMs() { return prefs.getLong("lastSentMs", 0L); }
    void markSent(long now) { prefs.edit().putLong("lastSentMs", now).apply(); }

    synchronized void enqueue(JSONObject reading, long now) {
        JSONArray queue = fresh(now);
        queue.put(reading);
        while (queue.length() > MAX_QUEUE) queue.remove(0);
        prefs.edit().putString(QUEUE, queue.toString()).putLong("lastReadingMs", now).apply();
    }

    /** The oldest readings first, at most ``limit``. */
    synchronized JSONArray peek(int limit, long now) {
        JSONArray queue = fresh(now);
        JSONArray out = new JSONArray();
        for (int i = 0; i < queue.length() && i < limit; i++) out.put(queue.opt(i));
        return out;
    }

    /** Drop the ``count`` oldest readings (they were answered). */
    synchronized void drop(int count, long now) {
        JSONArray queue = fresh(now);
        JSONArray rest = new JSONArray();
        for (int i = count; i < queue.length(); i++) rest.put(queue.opt(i));
        prefs.edit().putString(QUEUE, rest.toString()).apply();
    }

    synchronized int pending(long now) {
        return fresh(now).length();
    }

    private JSONArray fresh(long now) {
        JSONArray stored;
        try {
            stored = new JSONArray(prefs.getString(QUEUE, "[]"));
        } catch (JSONException e) {
            stored = new JSONArray();
        }
        JSONArray kept = new JSONArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject reading = stored.optJSONObject(i);
            if (reading == null) continue;
            long at = parseIso(reading.optString("capturedAt", ""));
            if (at > 0 && now - at <= MAX_AGE_MS) kept.put(reading);
        }
        return kept;
    }

    static String iso(long ms) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(ms));
    }

    static long parseIso(String value) {
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date date = format.parse(value);
            return date == null ? 0L : date.getTime();
        } catch (ParseException e) {
            return 0L;
        }
    }
}

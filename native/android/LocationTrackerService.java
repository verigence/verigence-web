package __PACKAGE__;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Random;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The phone's location from check-in to check-out (product owner, 2026-11-16:
 * "though app may be in background or may be killed.. some way to collect the
 * data").
 *
 * A foreground service, so Android keeps it running while the app is in the
 * background or swiped away; it shows the notification Android requires. Every
 * clock hour is split into slots of ``intervalMinutes`` (20: at most 3 readings an
 * hour, the server's limit) and one reading is taken at a random moment in each
 * slot, only between 10:00 and 19:30 IST. Each reading is kept on the phone first
 * and sent when there is a network, with the moment it was read, so a phone with
 * no signal loses nothing. The service stops at the end of the day's tracking, at
 * check-out, or when the server says the key is no longer active.
 */
public class LocationTrackerService extends Service {
    static final String ACTION_START = "com.verigence.location.START";
    static final String ACTION_TICK = "com.verigence.location.TICK";
    static final String ACTION_STOP = "com.verigence.location.STOP";
    static final String ACTION_FLUSH = "com.verigence.location.FLUSH";

    private static final String CHANNEL_ID = "vg_location_tracking";
    private static final int NOTIFICATION_ID = 7301;
    private static final int ALARM_REQUEST = 7302;
    private static final long LOCATION_TIMEOUT_MS = 30_000L;
    private static final int SEND_BATCH = 50;
    private static final TimeZone IST = TimeZone.getTimeZone("Asia/Kolkata");

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Random random = new Random();
    private final AtomicBoolean sending = new AtomicBoolean(false);
    private ConnectivityManager.NetworkCallback networkCallback;
    private LocationTrackerStore store;

    static void start(Context context) {
        Intent intent = new Intent(context, LocationTrackerService.class).setAction(ACTION_START);
        ContextCompat.startForegroundService(context, intent);
    }

    static void stop(Context context) {
        cancelAlarm(context);
        context.stopService(new Intent(context, LocationTrackerService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        store = new LocationTrackerStore(this);
        listenForNetwork();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        long now = System.currentTimeMillis();
        String action = intent == null ? ACTION_TICK : intent.getAction();
        if (ACTION_STOP.equals(action) || !store.isActive(now)) {
            finish(true);
            return START_NOT_STICKY;
        }
        if (!goForeground()) {
            // Android refused (no location permission now): stop rather than crash.
            finish(false);
            return START_NOT_STICKY;
        }
        if (ACTION_TICK.equals(action) && inWindow(now)) {
            takeReading();
        } else {
            sendQueued();
        }
        scheduleNext(now);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) {
                // Already gone.
            }
        }
        worker.shutdown();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ foreground

    private boolean goForeground() {
        if (!hasLocationPermission(this)) return false;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Work location", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while Verigence records your location between check-in and check-out.");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = open == null ? null : PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            // Product owner, 19 Nov 2026: no strong wording and no hours in what the person reads.
            .setContentTitle("Verigence")
            .setContentText("Work location is on until you check out.")
            .setContentIntent(content)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void finish(boolean ended) {
        if (ended) store.endTracking();
        cancelAlarm(this);
        sendQueued();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    // ------------------------------------------------------------------ timing

    static int istMinuteOfDay(long ms) {
        Calendar calendar = Calendar.getInstance(IST);
        calendar.setTimeInMillis(ms);
        return calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE);
    }

    private boolean inWindow(long ms) {
        int minute = istMinuteOfDay(ms);
        return minute >= store.windowFromMinute() && minute < store.windowToMinute();
    }

    /** A random moment in the next slot (or in the first slot of the window when it has not begun). */
    private void scheduleNext(long now) {
        int interval = store.intervalMinutes();
        int minute = istMinuteOfDay(now);
        int from = store.windowFromMinute();
        int to = store.windowToMinute();
        int slotStart = minute < from ? from : ((minute / interval) + 1) * interval;
        if (slotStart >= to || now >= store.trackingUntilMs()) {
            // Nothing more today; the service stops at the next start command or now.
            scheduleAt(Math.min(store.trackingUntilMs(), now + 60_000L));
            return;
        }
        int slotEnd = Math.min(slotStart + interval, to);
        long slotStartMs = now + (long) (slotStart - minute) * 60_000L - (now % 60_000L);
        long span = Math.max(60_000L, (long) (slotEnd - slotStart) * 60_000L - 30_000L);
        scheduleAt(slotStartMs + (long) (random.nextDouble() * span));
    }

    private void scheduleAt(long at) {
        AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent tick = tickIntent(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, tick);
        } else {
            alarms.set(AlarmManager.RTC_WAKEUP, at, tick);
        }
    }

    private static PendingIntent tickIntent(Context context) {
        Intent intent = new Intent(context, LocationTrackerService.class).setAction(ACTION_TICK);
        return PendingIntent.getService(context, ALARM_REQUEST, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void cancelAlarm(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }

    // ------------------------------------------------------------------ reading

    static boolean hasLocationPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressLint("MissingPermission")
    private void takeReading() {
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock lock = power == null ? null
            : power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "verigence:location");
        if (lock != null) lock.acquire(LOCATION_TIMEOUT_MS + 15_000L);
        final long startedAt = System.currentTimeMillis();
        final AtomicBoolean done = new AtomicBoolean(false);
        final LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        final CancellationSignal cancel = new CancellationSignal();

        final Runnable timeout = () -> {
            if (done.compareAndSet(false, true)) {
                cancel.cancel();
                record(null, "UNAVAILABLE", "Timed out waiting for the location.", startedAt, lock);
            }
        };
        if (!hasLocationPermission(this)) {
            record(null, "DENIED", "Location permission is off.", startedAt, lock);
            return;
        }
        String provider = pickProvider(manager);
        if (manager == null || provider == null) {
            record(null, "UNAVAILABLE", "Location is switched off on the phone.", startedAt, lock);
            return;
        }
        main.postDelayed(timeout, LOCATION_TIMEOUT_MS);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                manager.getCurrentLocation(provider, cancel, ContextCompat.getMainExecutor(this), location -> {
                    if (done.compareAndSet(false, true)) {
                        main.removeCallbacks(timeout);
                        if (location == null) {
                            record(null, "UNAVAILABLE", "The phone gave no location.", startedAt, lock);
                        } else {
                            record(location, "LOCATED", null, startedAt, lock);
                        }
                    }
                });
            } else {
                manager.requestSingleUpdate(provider, new LocationListener() {
                    @Override public void onLocationChanged(Location location) {
                        if (done.compareAndSet(false, true)) {
                            main.removeCallbacks(timeout);
                            record(location, "LOCATED", null, startedAt, lock);
                        }
                    }
                    @Override public void onStatusChanged(String p, int status, Bundle extras) { }
                    @Override public void onProviderEnabled(String p) { }
                    @Override public void onProviderDisabled(String p) { }
                }, Looper.getMainLooper());
            }
        } catch (RuntimeException e) {
            if (done.compareAndSet(false, true)) {
                main.removeCallbacks(timeout);
                record(null, "UNAVAILABLE", "The phone could not read the location.", startedAt, lock);
            }
        }
    }

    private static String pickProvider(LocationManager manager) {
        if (manager == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && manager.getAllProviders().contains(LocationManager.FUSED_PROVIDER)
            && (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))) {
            return LocationManager.FUSED_PROVIDER;
        }
        if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return LocationManager.NETWORK_PROVIDER;
        if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) return LocationManager.GPS_PROVIDER;
        return null;
    }

    private void record(Location location, String outcome, String detail, long startedAt,
                        PowerManager.WakeLock lock) {
        try {
            JSONObject reading = new JSONObject();
            reading.put("outcome", outcome);
            reading.put("source", "NATIVE");
            reading.put("deviceType", "ANDROID");
            reading.put("queued", true);
            reading.put("clientCheckId", "a-" + UUID.randomUUID());
            long at = location != null && location.getTime() > 0 ? Math.min(location.getTime(), System.currentTimeMillis())
                : startedAt;
            reading.put("capturedAt", LocationTrackerStore.iso(at));
            if (location != null) {
                reading.put("latitude", location.getLatitude());
                reading.put("longitude", location.getLongitude());
                if (location.hasAccuracy()) reading.put("accuracyM", (double) location.getAccuracy());
            }
            if (detail != null) reading.put("detail", detail);
            store.enqueue(reading, System.currentTimeMillis());
        } catch (Exception ignored) {
            // A reading that cannot be written is lost; the next slot reads again.
        } finally {
            if (lock != null && lock.isHeld()) lock.release();
        }
        sendQueued();
    }

    // ------------------------------------------------------------------ sending

    private void listenForNetwork() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                sendQueued();
            }
        };
        try {
            cm.registerDefaultNetworkCallback(networkCallback);
        } catch (RuntimeException e) {
            networkCallback = null;
        }
    }

    private void sendQueued() {
        if (!sending.compareAndSet(false, true)) return;
        final Context context = getApplicationContext();
        try {
            worker.execute(() -> {
                try {
                    boolean stop = sendAll(context, store);
                    if (stop) main.post(() -> finish(true));
                } finally {
                    sending.set(false);
                }
            });
        } catch (RuntimeException e) {
            sending.set(false);
        }
    }

    /**
     * Send every reading kept, oldest first, in batches. Returns true when the server
     * says tracking is over (check-out, 19:30, or another phone took over).
     */
    static boolean sendAll(Context context, LocationTrackerStore store) {
        boolean over = false;
        for (int round = 0; round < 10; round++) {
            long now = System.currentTimeMillis();
            String key = store.key();
            if (key == null) return true;
            JSONArray batch = store.peek(SEND_BATCH, now);
            if (batch.length() == 0) return over;
            HttpURLConnection connection = null;
            try {
                JSONObject body = new JSONObject();
                body.put("checks", batch);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                URL url = new URL(store.baseUrl() + store.path());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15_000);
                connection.setReadTimeout(30_000);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("X-Location-Key", key);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
                int status = connection.getResponseCode();
                if (status == 200) {
                    String text = read(connection.getInputStream());
                    JSONObject answer = new JSONObject(text);
                    store.drop(batch.length(), now);
                    store.markSent(now);
                    if (!answer.optBoolean("trackingActive", true)) over = true;
                } else if (status == 401) {
                    store.forgetKey();
                    return true;
                } else if (status == 422) {
                    // A reading the server cannot read: drop it rather than block the rest.
                    store.drop(1, now);
                } else {
                    return over; // try again later
                }
            } catch (Exception e) {
                return over; // no network: the readings stay on the phone
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        return over;
    }

    private static String read(InputStream stream) throws java.io.IOException {
        try (InputStream in = stream) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) != -1) buffer.write(chunk, 0, n);
            return buffer.toString("UTF-8");
        }
    }
}

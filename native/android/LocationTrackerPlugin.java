package __PACKAGE__;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executors;

/**
 * The bridge between the web app and the phone's location tracking service
 * (product owner, 2026-11-16). The app calls start() after a check-in with the
 * day's tracking key, and stop() after check-out.
 */
@CapacitorPlugin(name = "VerigenceLocationTracker")
public class LocationTrackerPlugin extends Plugin {
    private static final int BACKGROUND_REQUEST = 7310;
    private static final int NOTIFICATION_REQUEST = 7311;

    @Override
    public void load() {
        // Readings kept from an earlier day (or before the app was closed) go out now.
        final Context context = getContext().getApplicationContext();
        Executors.newSingleThreadExecutor().execute(() ->
            LocationTrackerService.sendAll(context, new LocationTrackerStore(context)));
    }

    @PluginMethod
    public void start(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String path = call.getString("path");
        String key = call.getString("key");
        Long until = call.getLong("trackingUntilMs");
        if (baseUrl == null || path == null || key == null || until == null) {
            call.reject("baseUrl, path, key and trackingUntilMs are required.");
            return;
        }
        Context context = getContext();
        if (!LocationTrackerService.hasLocationPermission(context)) {
            call.reject("Location permission is off.", "NO_LOCATION_PERMISSION");
            return;
        }
        new LocationTrackerStore(context).saveSession(
            baseUrl.replaceAll("/+$", ""), path, key, until,
            call.getInt("intervalMinutes", 20), call.getInt("windowFromMinute", 600),
            call.getInt("windowToMinute", 1170));
        askForNotifications();
        try {
            LocationTrackerService.start(context);
        } catch (RuntimeException e) {
            call.reject("The phone did not allow location tracking to start.", "START_REFUSED");
            return;
        }
        call.resolve(status(context));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        new LocationTrackerStore(context).endTracking();
        LocationTrackerService.stop(context);
        // What was read before check-out still goes out.
        final Context app = context.getApplicationContext();
        Executors.newSingleThreadExecutor().execute(() ->
            LocationTrackerService.sendAll(app, new LocationTrackerStore(app)));
        call.resolve(status(context));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status(getContext()));
    }

    @PluginMethod
    public void flush(PluginCall call) {
        final Context app = getContext().getApplicationContext();
        Executors.newSingleThreadExecutor().execute(() ->
            LocationTrackerService.sendAll(app, new LocationTrackerStore(app)));
        call.resolve(status(getContext()));
    }

    /** "Allow all the time": a dialog on Android 10, the app's location settings from Android 11. */
    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundPermission(getContext())
            && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(),
                new String[] {Manifest.permission.ACCESS_BACKGROUND_LOCATION}, BACKGROUND_REQUEST);
        }
        call.resolve(status(getContext()));
    }

    /** Ask to be left running when the phone saves battery (the phone's own dialog). */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestUnrestrictedBattery(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !ignoresBatteryOptimizations(context)) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:" + context.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (RuntimeException e) {
                Intent settings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + context.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
            }
        }
        call.resolve(status(context));
    }

    private void askForNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getActivity() != null
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        }
    }

    static boolean hasBackgroundPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return LocationTrackerService.hasLocationPermission(context);
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean ignoresBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
    }

    private static JSObject status(Context context) {
        LocationTrackerStore store = new LocationTrackerStore(context);
        long now = System.currentTimeMillis();
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("active", store.isActive(now));
        result.put("trackingUntilMs", store.trackingUntilMs());
        result.put("pending", store.pending(now));
        result.put("lastReadingMs", store.lastReadingMs());
        result.put("lastSentMs", store.lastSentMs());
        result.put("locationPermission", LocationTrackerService.hasLocationPermission(context));
        result.put("backgroundPermission", hasBackgroundPermission(context));
        result.put("unrestrictedBattery", ignoresBatteryOptimizations(context));
        return result;
    }
}

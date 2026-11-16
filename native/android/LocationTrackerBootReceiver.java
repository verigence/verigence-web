package __PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After the phone restarts (or the app is updated) during a tracked day, start
 * the location tracking again. Android allows a location service to start from
 * here only with "Allow all the time"; without it tracking resumes the next time
 * the app is opened.
 */
public class LocationTrackerBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        LocationTrackerStore store = new LocationTrackerStore(context);
        if (!store.isActive(System.currentTimeMillis())) return;
        if (!LocationTrackerPlugin.hasBackgroundPermission(context)) return;
        try {
            LocationTrackerService.start(context);
        } catch (RuntimeException ignored) {
            // Android refused; the app restarts it when opened.
        }
    }
}

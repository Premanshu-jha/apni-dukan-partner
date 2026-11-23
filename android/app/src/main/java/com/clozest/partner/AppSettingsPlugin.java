package com.clozest.partner;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.OutputStream;

/**
 * Small things the web side can't do by itself: open this app's notification settings (when the owner turned them
 * off, one tap instead of a menu path that differs by phone brand), and save the salon's poster in the phone's
 * Pictures › Clozest, to print (many phones' share sheets have no "save" target).
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotifications(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Couldn't open the settings", "UNAVAILABLE");
        }
    }

    /**
     * Saves a PNG ({@code data}: base64) as {@code name} in Pictures/Clozest. Android 10 and later only (no storage
     * permission needed there); older phones get "UNSUPPORTED" and the app offers its share sheet instead.
     */
    @PluginMethod
    public void savePicture(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name");
        // The poster's file name (a salon name in any script, then "-clozest-poster.png"): never a path
        if (data == null || name == null || name.length() > 120 || !name.endsWith(".png") || name.contains("/")
                || name.contains("\\") || name.contains("..")) {
            call.reject("data and a .png name are needed", "BAD_ARGUMENTS");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Not on this Android version", "UNSUPPORTED");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Clozest");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("no uri");
            }
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new IllegalStateException("no stream");
                }
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            call.resolve(new JSObject());
        } catch (Exception e) {
            if (uri != null) {
                resolver.delete(uri, null, null);
            }
            call.reject("Couldn't save the picture", "SAVE_FAILED");
        }
    }

    /**
     * Sign-out: Firebase forgets this phone's token, and the promise says whether it really did (Capacitor's own
     * unregister answers before Firebase has, so a sign-out offline would look done). Rejected "OFFLINE" when Firebase
     * couldn't be reached: the app tries again at its next start.
     */
    @PluginMethod
    public void dropPushToken(PluginCall call) {
        FirebaseMessaging messaging;
        try {
            messaging = FirebaseMessaging.getInstance();
        } catch (IllegalStateException e) {
            call.resolve();   // built without Firebase: there is no token
            return;
        }
        messaging.setAutoInitEnabled(false);
        messaging.deleteToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Firebase couldn't be reached", "OFFLINE");
            }
        });
    }
}

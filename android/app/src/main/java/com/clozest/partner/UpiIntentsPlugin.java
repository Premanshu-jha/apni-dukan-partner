package com.clozest.partner;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URISyntaxException;

/**
 * Razorpay's checkout inside the app opens the UPI app (GPay, PhonePe, Paytm...) for the AutoPay PIN with an
 * {@code intent://} link (Razorpay's "UPI intent in WebView"). Capacitor opens other links with Android as they are,
 * which doesn't work for that form: here it is read as the Android intent it describes and started, only for a
 * {@code upi:} payment, only as another app's browsable screen and with no access rights to any of the app's files
 * (whatever flags the link carries). Without that UPI app on the phone, its fallback address (https only) opens in
 * the browser, outside the app; the checkout stays open in the app, where the owner can pick another way to pay.
 * Every other link is left to Capacitor.
 */
@CapacitorPlugin(name = "UpiIntents")
public class UpiIntentsPlugin extends Plugin {

    private static final int GRANTS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!"intent".equals(url.getScheme())) {
            return null;
        }
        Intent intent;
        try {
            intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            return true;   // not a link Android can read: nothing to open
        }
        String fallback = intent.getStringExtra("browser_fallback_url");
        Uri data = intent.getData();
        if (data != null && "upi".equalsIgnoreCase(data.getScheme())) {
            // Only another app's screen: never one of ours, never with rights to our files
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            intent.setClipData(null);
            intent.setFlags(intent.getFlags() & ~GRANTS);
            try {
                getActivity().startActivity(intent);
                return true;
            } catch (RuntimeException e) {
                // No such UPI app on the phone (or it refused): the fallback, if any
            }
        }
        if (fallback != null && fallback.startsWith("https://")) {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback))
                        .addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (RuntimeException e) {
                // No browser: nothing to open
            }
        }
        return true;
    }
}

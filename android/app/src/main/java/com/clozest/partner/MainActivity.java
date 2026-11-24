package com.clozest.partner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (before the bridge starts): paying in the app, UPI apps from Razorpay's checkout, and
        // the notification settings and saving the poster
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(UpiIntentsPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

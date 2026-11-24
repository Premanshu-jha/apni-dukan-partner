package com.clozest.partner;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.UserChoiceDetails;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

/**
 * Paying the salon's subscription in the Play Store app with user choice billing (India): {@code subscribe} opens
 * Google's choice screen for the subscription product, and resolves with what the owner picked:
 * <ul>
 *   <li>{@code {choice: "RAZORPAY", externalTransactionToken}}: the app opens Razorpay's checkout, and the backend
 *       reports its payments to Google with the token;</li>
 *   <li>{@code {choice: "GOOGLE_PLAY", purchaseToken}}: Google charged; the backend checks and acknowledges it;</li>
 *   <li>{@code {choice: "CANCELLED"}}: closed without paying.</li>
 * </ul>
 * Rejects with Google's code ("UNAVAILABLE", "NO_PRODUCT", "BILLING_UNAVAILABLE", "ALREADY_OWNED", ...) otherwise.
 * The website never calls it (src/lib/playBilling.ts asks isApp() first). One payment at a time: a second call while
 * one is open is refused ("BUSY"). Google Play charges at once (the base plan, no free trial: the app offers paying
 * only once the salon's free or paid time is over).
 * <p>
 * {@code purchases} lists this phone's Google Play purchases of the product, so the app can send the backend one it
 * never confirmed (the network dropped, the app closed, or a slow payment finished later); a purchase that finishes
 * while no {@code subscribe} call waits (pending, then paid) is also sent to the page as a "purchase" event.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {

    private BillingClient client;
    /** The JavaScript call waiting for the owner's choice (one at a time). */
    private PluginCall pending;
    private String productId;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(this::onPurchases)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableUserChoiceBilling(this::onUserChoice)
                .build();
    }

    @PluginMethod
    public void subscribe(PluginCall call) {
        String product = call.getString("productId");
        String account = call.getString("accountId");
        if (product == null || product.isEmpty() || account == null || account.isEmpty()) {
            call.reject("productId and accountId are needed", "BAD_ARGUMENTS");
            return;
        }
        if (pending != null) {
            call.reject("A payment is already open", "BUSY");
            return;
        }
        pending = call;
        productId = product;
        whenConnected(() -> launch(product, account), this::fail);
    }

    /** The phone's Google Play purchases of {@code productId}: [{purchaseToken, acknowledged, pending}]. */
    @PluginMethod
    public void purchases(PluginCall call) {
        String product = call.getString("productId");
        if (product == null || product.isEmpty()) {
            call.reject("productId is needed", "BAD_ARGUMENTS");
            return;
        }
        whenConnected(() -> client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (result, list) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("Google Play didn't list the purchases", code(result));
                        return;
                    }
                    JSArray out = new JSArray();
                    for (Purchase p : list) {
                        if (p.getProducts().contains(product)) {
                            out.put(purchase(p));
                        }
                    }
                    JSObject answer = new JSObject();
                    answer.put("purchases", out);
                    call.resolve(answer);
                }), (message, code) -> call.reject(message, code));
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) {
            client.endConnection();
        }
        super.handleOnDestroy();
    }

    /** How a call that couldn't connect is answered. */
    private interface Failure {
        void fail(String message, String code);
    }

    private void whenConnected(Runnable then, Failure otherwise) {
        if (client.isReady()) {
            then.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    then.run();
                } else {
                    otherwise.fail("Google Play billing isn't available on this phone", code(result));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call connects again
            }
        });
    }

    private void launch(String product, String account) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(product)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()))
                .build();
        client.queryProductDetailsAsync(params, (result, details) -> {
            List<ProductDetails> list = details.getProductDetailsList();
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || list.isEmpty()) {
                fail("The subscription isn't set up in Google Play", "NO_PRODUCT");
                return;
            }
            ProductDetails pd = list.get(0);
            List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
            ProductDetails.SubscriptionOfferDetails offer = offers == null ? null : basePlan(offers);
            if (offer == null) {
                fail("The subscription has no plan in Google Play", "NO_PRODUCT");
                return;
            }
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(pd)
                                    .setOfferToken(offer.getOfferToken())
                                    .build()))
                    // The salon it is for, so the backend (and Google's notifications) know whose purchase it is
                    .setObfuscatedAccountId(account)
                    .build();
            getActivity().runOnUiThread(() -> {
                BillingResult launched = client.launchBillingFlow(getActivity(), flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    fail("Google Play couldn't open the payment", code(launched));
                }
            });
        });
    }

    /**
     * The base plan itself (no offer id): ₹500 a month, charged at once. Never an offer with a free phase (a free
     * trial at Google would repeat the salon's own, once per Google account).
     */
    private static ProductDetails.SubscriptionOfferDetails basePlan(
            List<ProductDetails.SubscriptionOfferDetails> offers) {
        for (ProductDetails.SubscriptionOfferDetails o : offers) {
            if (o.getOfferId() == null) {
                return o;
            }
        }
        return null;
    }

    /** The owner picked Razorpay on Google's choice screen. */
    private void onUserChoice(UserChoiceDetails details) {
        JSObject out = new JSObject();
        out.put("choice", "RAZORPAY");
        out.put("externalTransactionToken", details.getExternalTransactionToken());
        succeed(out);
    }

    /** Google Play's own payment finished (or was closed). */
    private void onPurchases(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject out = new JSObject();
            out.put("choice", "CANCELLED");
            succeed(out);
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null) {
            fail("Google Play's payment didn't go through", code(result));
            return;
        }
        for (Purchase p : purchases) {
            if (productId != null && p.getProducts().contains(productId)) {
                if (pending == null) {
                    // Finished later (a pending payment that went through): the page confirms it if it is open, and
                    // the subscription page finds it with purchases() otherwise
                    notifyListeners("purchase", purchase(p));
                    return;
                }
                JSObject out = purchase(p);
                out.put("choice", "GOOGLE_PLAY");
                succeed(out);
                return;
            }
        }
        fail("Google Play's payment didn't go through", "NO_PURCHASE");
    }

    private static JSObject purchase(Purchase p) {
        JSObject out = new JSObject();
        out.put("purchaseToken", p.getPurchaseToken());
        out.put("acknowledged", p.isAcknowledged());
        out.put("pending", p.getPurchaseState() == Purchase.PurchaseState.PENDING);
        return out;
    }

    private void succeed(JSObject out) {
        PluginCall call = pending;
        pending = null;
        if (call != null) {
            call.resolve(out);
        }
    }

    private void fail(String message, String code) {
        PluginCall call = pending;
        pending = null;
        if (call != null) {
            call.reject(message, code);
        }
    }

    private static String code(BillingResult result) {
        switch (result.getResponseCode()) {
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
                return "BILLING_UNAVAILABLE";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "UNAVAILABLE";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:
                return "ALREADY_OWNED";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "NO_PRODUCT";
            default:
                return "ERROR_" + result.getResponseCode();
        }
    }
}

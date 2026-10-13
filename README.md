# Vela

Vela is a quoting app for solo trade contractors. The Android app is labeled **Vela**.

## Install the Android test build

You need the APK link from the person running the test. You do not need a Google Play account, an Expo account, or a paid subscription.

1. Open the link on your Android phone and download the `.apk`. If the phone will not download it, download the file on a computer and transfer it.
2. Open the file. If Android asks, allow installation from that source (the browser or Files).
3. Open Vela.
4. Create an account.
5. On the first screen, choose **United States**. That sets US dollars, feet for cable, hours for labor, and **Sales tax** at 0%. Type a different sales tax percent if you need one, then continue. **Israel** is the other choice (shekels, meters, 18% VAT).
6. Pick your trade and hourly rate, then make a quote. **Share quote** builds a PDF in dollars with the sales tax label.

The test build does not send text messages and does not take payment.

## Building that APK

`apps/mobile/eas.json` has a `preview` profile. It builds an installable Android APK (`distribution: internal`, `android.buildType: apk`). It is not a Play Store bundle. It does not enable EAS Submit, Play billing, Twilio, or any other paid service.

Do not commit API keys, keystores, `credentials.json`, or `.env` files. The API address is a public URL set at build time, not a secret stored in git.

From a computer that already has an Expo login (details in [docs/EAS-ANDROID.md](docs/EAS-ANDROID.md)):

```bash
cd <repo-root>
EXPO_PUBLIC_API_URL=https://your-api.example npm run eas:android:preview
```

Use the public https address of the test server. Share the finished APK, or the Expo install link, with testers. CI does not log into Expo and does not start a build.

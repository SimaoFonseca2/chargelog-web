# ChargeLog (web app)

ChargeLog as a web app you add to your iPhone's Home Screen. There's no signing, nothing expires after 7 days, and you don't need a computer once it's set up.

Formula: `kWh = % × 44 × 1.20` and `€ = kWh × 0.15 × 1.23`. All of these values can be changed in Settings.

## Features

- **Charge:** start with the battery %. While charging you see the elapsed time, an estimated live % and the cost so far. End it with just the end %.
- **Reminders:** set them *after X hours* (1–10h presets) or *at a time*, or use the charging-time estimate. They go to the **iOS Reminders app** through a Shortcut, so they ring even when ChargeLog is closed and you can snooze them there. You can send them to Calendar instead.
- **History:** grouped by month with € and kWh totals. Tap a charge to edit it, swipe left to delete, and export to CSV.
- **Stats:** monthly € or kWh chart (tap a month for details), averages and a cost-per-charge trend.
- **Settings:** battery, cable loss, charger power, price and IVA. You can also apply values to past charges, save a backup or restore one.
- Works offline and follows your phone's light/dark mode.

## Put it online (free, about 5 minutes)

The app needs a web address. GitHub Pages hosts it for free.

1. Use your existing repo or make a new one. It must be **public** for free GitHub Pages. Only the app's code goes there; your charges stay on your phone.
2. Upload the **`docs`** folder from this zip, with everything inside it, to the repo and commit.
3. In the repo, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
4. After about a minute the page shows your address, something like `https://YOUR-NAME.github.io/chargelog/`.

If the repo still has the old native-app build file (`.github/workflows/build-ipa.yml`), you can delete it.

## Install on your iPhone

1. Open that address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open ChargeLog from the Home Screen.

## Set up reminders (one time)

In ChargeLog, open **Settings → How to set up the Shortcut** and follow the 6 steps. In short:

1. In the **Shortcuts** app, make a new shortcut named exactly **`ChargeLog Reminder`**.
2. Add **Get Dates from Input** and set its input to **Shortcut Input**.
3. Add **Add New Reminder** with the text "Check the car (ChargeLog)". Turn on its alert and set the date to **Dates**.
4. Back in ChargeLog, tap **Send a test reminder**. Allow access to Reminders when asked, and a reminder should ring 2 minutes later.

ChargeLog sends the time as text like `2026-11-14 23:05`. If your reminder lands at the wrong time, let me know and I'll change the format.

## Back up now and then

Your data lives only in the Home Screen app on your phone. Use **Settings → Save a backup** every so often and save it to Files or iCloud Drive. **Restore from backup** brings it back, for example on a new phone.

## Updating the app

Replace the files in `docs/` on GitHub. The installed app picks up the new version the next time it opens while online.

To make changes yourself, edit the files in `src/` and run `python3 build.py`. That rebuilds `docs/index.html`, which contains the whole app in one file.

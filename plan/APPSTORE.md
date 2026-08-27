# App Store (+ Play Store) publishing checklist

## Blockers being built (dev)
- [x] Privacy policy page → carfable.com/privacy (LIVE)
- [x] Support page → carfable.com/support (LIVE)
- [x] Sign in with Apple (backend + app, entitlement fixed)
- [x] Google login (iOS client wired)
- [x] Build 6 on TestFlight — owner verified both logins

## Owner steps (App Store Connect, appstoreconnect.apple.com → CarFable)
- [x] hello@carfable.com: Cloudflare → Email → Email Routing → forward to joseprupi@gmail.com
- [x] Listing: name "CarFable", subtitle (e.g. "Your car's life, in one place"), description, keywords, category (Lifestyle or Utilities), support URL carfable.com/support, privacy policy URL carfable.com/privacy (drafts: ask orchestrator, texts prepared on request)
- [x] Screenshots: (resized to 1284×2778 from owner iPhone) 6.7" iPhone set (take on your iPhone from TestFlight: feed, vehicle history, stats, fuel-up, garage; screenshots straight from the phone are accepted)
- [x] App Privacy questionnaire: collects Email, Name, Photos/Videos, User Content, Coarse-free-text location — all "linked to identity", none used for tracking; no third-party ads
- [x] Age rating questionnaire (13+, social/UGC): everything "None" → 4+
- [x] App Review notes: demo account reviewer@carfable.com / CarFable-Review1 (prod, public Civic w/ history) (create a dedicated reviewer@… account with sample car, NOT the owner account)
- [x] SUBMITTED 2026-08-25 (after also setting: category Lifestyle/Utilities, content rights = yes-with-rights, price Free), auto-release on approval

## Android / Play Store
- [x] EAS Android production build (AAB, versionCode 2) — done
- [ ] Preview APK for direct phone install (no store needed) — for owner testing on any Android device
- [ ] Owner: Google Play Console account ($25 one-time), then: listing, data-safety form (mirror of App Privacy), content rating, internal testing track → production. Note: new personal Play accounts require a closed test with 12 testers for 14 days before production — plan for that or use an organization account.
- [ ] Google login on Android needs an Android OAuth client (package com.carfable.app + SHA-1 of the EAS keystore — get via `eas credentials` after first Android build)

## Post-publish
- [ ] Sign in with Apple on web (optional parity)
- [ ] cececar.com → carfable.com redirect, www.carfable.com

## App Review reply — Guideline 2.1 Information Needed (rejection 2026-08-26)
Paste into "Reply to App Review" AND into App Review Information → Notes. Attach the screen recording.

**1. Screen recording** — attached (recorded on iPhone 17e, iOS 26.5.2). Shows: launch → Sign in with Apple → log out → email sign-up → adding a vehicle (VIN decode) → camera permission prompt while scanning a receipt → the history timeline → reporting and blocking a user from a post → Settings → Delete account.

**2. Devices tested** — iPhone 17e (iOS 26.5.2) via TestFlight; iPhone 15 Pro / iOS 18 simulator during development.

**3. What the app does / audience** — CarFable keeps a vehicle's complete service history: owners log maintenance, repairs, fuel-ups and modifications, attach receipt photos (the app reads the receipt to pre-fill date, cost and shop), and get mileage and cost statistics. The history stays with the car: owners can transfer a vehicle's record to a buyer. Audience: car enthusiasts and private sellers/buyers, 13+. Value: a trustworthy, portable service record instead of a shoebox of receipts.

**4. Setup / access** — Demo account (email login): reviewer@carfable.com / CarFable-Review1 — it owns a sample car with history. Sign in with Apple and Google are also available. Main features: Garage tab → tap a car → History (events, receipts, stats) / Build (mods, specs, recalls) / Posts. "+" on a car → Add event or Fuel-up (camera or photo library; sample receipt photos are not required — any receipt or fuel-pump photo works, and events can be typed manually). Settings (Profile → gear): change password, delete account.

**5. External services** — Google Cloud (Cloud Run hosting, Cloud SQL database, Cloud Storage for photos); Google Gemini API (reads receipt/fuel-pump photos the user chooses to scan and detects personal information on receipts to keep it private; images are not used for training); Google Sign-In and Sign in with Apple (authentication); NHTSA vPIC and Recalls APIs (public US-government vehicle data: VIN decoding and safety recalls). No ads, no analytics SDKs in the app, no payments or subscriptions.

**6. Regional differences** — None. The app functions identically in all regions (units are US miles/gallons; VIN decoding covers US-market VINs best but is optional).

**7. Regulated industry / third-party material** — Not applicable. Users upload their own photos and receipts; NHTSA data is public-domain US government data.

### Screen-recording script (owner; iPhone Settings → Control Center → Screen Recording; keep it under ~3 min)
1. Launch the TestFlight CarFable app (logged out).
2. Tap "Sign in with Apple" → Face ID → garage appears. Profile → Settings → Log out.
3. "New here? Create an account" → sign up with a throwaway email (e.g. review-demo+1@…) → garage.
4. Garage → Add vehicle → type VIN JTEBT17R748010246 → Decode → Save.
5. Open the car → Add event → Scan receipt → allow camera → take a photo of any receipt → Save. Show History with the receipt lock/visibility.
6. Feed → open someone else's post (log in as the reviewer account if needed) → ⋯ → Report post; ⋯ → Block user; profile → Unblock.
7. Profile → Settings → Delete account → confirm → back at login. Stop recording.

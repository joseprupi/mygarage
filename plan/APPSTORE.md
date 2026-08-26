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

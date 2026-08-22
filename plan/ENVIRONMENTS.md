# Environments — dev vs prod (decided 2026-08-22)

**Rule: Prod = real life. Dev = code under construction.**

| | DEV (home) | PROD (cloud) |
|---|---|---|
| Purpose | build & test features | the owner's real garage; later real users |
| Backend / DB / media | container `:8010`, local Postgres (docker), MinIO | Cloud Run `mygarage-backend`, Cloud SQL `mygarage-db`, GCS bucket |
| Web | Next dev `:3010` (VPN) | Firebase Hosting → **carfable.com** (cececar.com redirects during transition) |
| Mobile | Expo Go via Metro + VPN; `mobile/.env.development` → home backend | TestFlight build (EAS) with prod backend baked in; App Store when promoting |
| Data | fake cars, throwaway, wipeable | real data — never wiped; Cloud SQL backups |
| Accounts | `joseprupi@gmail.com / garage123` (local only) | owner's real sign-up; optional second "test" user for field experiments (delete its junk afterwards) |
| AI keys | GEMINI_API_KEY in backend/.env | Secret Manager `gemini-api-key` |

How the phone picks its world: **the build, not a setting**. Metro/Expo Go = dev (loads `.env.development`). EAS/TestFlight builds = prod (default API base in `mobile/src/lib/api.ts`).
Stopgap in use until a TestFlight build exists: Metro started with `EXPO_PUBLIC_API_BASE=<cloud run url>` so Expo Go uses prod data. Revert to plain `npx expo start` (from `mobile/`) once TestFlight is live.

Field usage (e.g. fuel-up at a gas station) is real life → prod app. Feature testing happens at home in dev with fake data; photos taken anywhere can be processed at home.

Ship path: dev verified → tests green → commit/push → `scripts/migrate.sh` (if migrations) → `scripts/deploy-backend.sh` → `scripts/deploy-frontend.sh` → EAS build/update for mobile.

## Owner TODO (account/console steps)
- [ ] carfable.com: Firebase custom domain + DNS records (Squarespace or move NS to Cloudflare; apex must be DNS-only/grey-cloud). Then Google OAuth authorized origins for carfable.com. Then redirect cececar.com.
- [ ] Apple Developer enrollment → EAS build → TestFlight; later App Store listing for promotion.
- [ ] Expo access token (optional interim: publish via EAS Update so Expo Go loads the app from the cloud without VPN).
- [ ] Rotate the Google OAuth client secret (leaked in old chat exports).

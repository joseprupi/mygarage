# Shared config for deploy scripts. NON-SECRET values only (this file is committed).
# Secrets live in Secret Manager and are referenced by name (see deploy-backend.sh).
PROJECT_ID="mygarage-app-9feafd"
REGION="us-central1"
BACKEND_SERVICE="mygarage-backend"
SERVICE_ACCOUNT="mygarage-app@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_INSTANCE="${PROJECT_ID}:${REGION}:mygarage-db"
MEDIA_BUCKET="${PROJECT_ID}-media"
BACKEND_URL="https://mygarage-backend-147573336932.us-central1.run.app"
# Public (not secret) — Google Sign-In client in the mygarage project.
GOOGLE_CLIENT_ID="147573336932-mm59b4qpu7nj6pbicu9f5forrnospa9a.apps.googleusercontent.com"
# Public (not secret) — GA4 measurement id (cececar web stream). Baked into the
# frontend build by deploy-frontend.sh; unset in dev so GA stays off.
GA_MEASUREMENT_ID="G-QRNM94B2EE"
# Origins allowed to call the API (comma-separated). Add the custom domain here when live:
#   ...,https://cececar.com,https://www.cececar.com
CORS_ORIGINS="https://${PROJECT_ID}.web.app,https://${PROJECT_ID}.firebaseapp.com,https://cececar.com,https://www.cececar.com"

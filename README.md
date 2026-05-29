# Car Social MVP

A car-specific social network where users own vehicle profiles, create image posts tagged to their vehicles, and maintain a durable vehicle history timeline.

## Stack

- Backend: FastAPI, SQLAlchemy, Alembic, Pydantic, JWT auth
- Database: Postgres
- Media: S3-compatible signed uploads
- Frontend: Next.js App Router, TypeScript, Tailwind, TanStack Query, TanStack Virtual

## Local Development

```bash
docker compose up -d postgres minio
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

In another shell:

```bash
cd frontend
npm install
npm run dev
```

The backend defaults to `http://localhost:8000`; the frontend defaults to `http://localhost:3001`.
Postgres is published on host port `5433` to avoid conflicts with any existing local Postgres on `5432`.

## Google Login

Create a Google OAuth Web Client in Google Cloud Console and add `http://localhost:3001`
as an authorized JavaScript origin. Then configure both apps with the same client ID:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Set `GOOGLE_CLIENT_ID` in `backend/.env` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in
`frontend/.env.local`, then restart both dev servers.

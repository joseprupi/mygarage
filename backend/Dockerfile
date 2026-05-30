# My Garage backend — production container (Cloud Run ready)
# Matches the project's Python (3.13, per the dev venv; pyproject requires >=3.11).
FROM python:3.13-slim

# - PYTHONDONTWRITEBYTECODE: no .pyc files in the image
# - PYTHONUNBUFFERED: logs stream straight to stdout/stderr (Cloud Logging friendly)
# - PORT: Cloud Run injects this; default 8080 for local/standalone runs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install the package first (better layer caching: deps only re-resolve when these change).
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN pip install --no-cache-dir .

# Run as a non-root user.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# Bind to 0.0.0.0 and the $PORT Cloud Run provides (default 8080).
# Migrations are NOT run here — run `alembic upgrade head` as a separate one-off
# job/command against the prod DB (see README / .env.production.example).
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}

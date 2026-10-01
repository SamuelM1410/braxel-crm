FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SCRAPEGRAPHAI_TELEMETRY_ENABLED=false \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && playwright install --with-deps chromium
COPY app.py ./
EXPOSE 8011
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8011}"]

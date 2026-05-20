FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Migrations on start (script outside /app so bind-mount ./backend:/app does not hide it)
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# A05: app runs as appuser; entrypoint starts as root to fix upload volume permissions
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /app/uploads/avatars /app/uploads/payment-qr /app/uploads/entry-proofs \
    && chown -R appuser:appuser /app /app/uploads
USER root

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

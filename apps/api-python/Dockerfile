FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Playwright and Postgres
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY apps/api-python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/api-python/ ./

# Expose port
EXPOSE 4000

ENV PORT=4000
ENV HOST=0.0.0.0

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000"]

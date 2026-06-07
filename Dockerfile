# ── Build stage: compile the React frontend ──────────────────────────────────
FROM node:20-alpine AS ui-builder

WORKDIR /build/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci --silent
COPY ui/ ./
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System deps (for bcrypt compilation)
RUN apt-get update && apt-get install -y --no-install-recommends gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY main.py .

# Copy compiled frontend into the static serving path
COPY --from=ui-builder /build/ui/dist ./app/static/

# Default env (override at runtime via -e or .env mount)
ENV PORT=3365 \
    MONGODB_URI=mongodb://mongo:27017/claudash \
    MONGODB_DB=claudash

EXPOSE 3365

CMD ["python", "main.py"]

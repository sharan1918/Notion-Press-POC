FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Install system dependencies if required for sqlite3/networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency requirements
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache ChromaDB ONNX embedding model during build
RUN python -c "import chromadb.utils.embedding_functions as ef; fn = ef.DefaultEmbeddingFunction(); fn(['warmup'])"

# Copy backend application source code
COPY app/ ./app/

# Ensure data directory exists and has permissions
RUN mkdir -p /app/data


# Expose port
EXPOSE 8000

# Health check with realistic start period for cloud container cold-starts
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start Uvicorn bound to 0.0.0.0 and dynamic $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

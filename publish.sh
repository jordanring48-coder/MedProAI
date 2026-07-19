#!/usr/bin/env bash
set -euo pipefail

echo "=== MedTrack AI Publish ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install dependencies
echo "Installing dependencies..."
bun install
(cd frontend && bun install)
(cd backend && bun install)

# Build frontend
echo "Building frontend..."
(cd frontend && bun run build)

# Build backend
echo "Building backend..."
(cd backend && bun run build)

# Kill anything on port 3000
echo "Stopping existing server on port 3000..."
sudo lsof -ti:3000 | xargs -r kill 2>/dev/null || true
sleep 1

# Start the production server on port 3000
echo "Starting MedTrack AI on port 3000..."
cd backend
# Load .env file if it exists (for secrets that don't propagate via platform env vars)
if [ -f .env ]; then
  set -a; source .env; set +a
fi
# Forward OpenAI credentials
OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
OPENAI_BASE_URL="${OPENAI_BASE_URL:-}" \
AI_MODEL="${AI_MODEL:-}" \
MEDCHRON_PORT=3000 STATIC_DIR=../frontend/dist nohup node dist/index.js > /tmp/medchron-server.log 2>&1 &

sleep 2

# Verify
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q 200; then
  echo "=== MedTrack AI is live on port 3000! ==="
else
  echo "ERROR: Server failed to start. Check /tmp/medchron-server.log"
  cat /tmp/medchron-server.log
  exit 1
fi

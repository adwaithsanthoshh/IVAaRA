#!/usr/bin/env bash
# IVaaRA – Quick Start Script
# Starts all services in the correct order for local development
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/backend/.venv"

# Colour helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   IVaaRA – Clinical OS Startup       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# 1. Check mosquitto
if ! command -v mosquitto &>/dev/null && ! docker ps -q --filter name=ivara-mqtt 2>/dev/null | grep -q .; then
  echo -e "${YELLOW}Mosquitto not found locally – starting via Docker...${NC}"
  docker run -d --rm --name ivara-mqtt \
    -p 1883:1883 \
    -v "$ROOT/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf" \
    eclipse-mosquitto:2.0
  echo -e "${GREEN}✓ Mosquitto started${NC}"
else
  echo -e "${GREEN}✓ MQTT broker detected${NC}"
fi

# 2. Backend venv check
if [ ! -f "$VENV/bin/activate" ]; then
  echo -e "${YELLOW}Creating Python virtual environment...${NC}"
  python3 -m venv "$VENV"
  source "$VENV/bin/activate"
  pip install -q -r "$ROOT/backend/requirements.txt"
  echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
  source "$VENV/bin/activate"
fi

# 3. Start backend in background
echo -e "${YELLOW}Starting backend API server...${NC}"
cd "$ROOT/backend"
uvicorn app.main:app --port 8000 --log-level info &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to be ready
sleep 2
for i in {1..10}; do
  if curl -sf http://localhost:8000/health &>/dev/null; then
    echo -e "${GREEN}✓ Backend healthy${NC}"
    break
  fi
  sleep 1
done

# 4. Start simulator in background
echo -e "${YELLOW}Starting device simulators (IV-001, IV-002, IV-003)...${NC}"
cd "$ROOT"
python simulator.py --all &
SIM_PID=$!
echo -e "${GREEN}✓ Simulators started (PID: $SIM_PID)${NC}"

# 5. Start frontend
echo -e "${YELLOW}Starting frontend dev server...${NC}"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  IVaaRA is running!${NC}"
echo -e "${GREEN}  Frontend:  http://localhost:5173${NC}"
echo -e "${GREEN}  API Docs:  http://localhost:8000/api/docs${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
trap "kill $BACKEND_PID $SIM_PID $FRONTEND_PID 2>/dev/null; echo 'Services stopped.'" EXIT INT TERM

wait $FRONTEND_PID

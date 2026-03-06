#!/bin/bash
# Atlas Racing — Start/Stop all services (macOS/Linux)
# Usage:
#   ./run.sh          Start backend + frontend
#   ./run.sh start    Same as above
#   ./run.sh stop     Stop all running services
#   ./run.sh backend  Start backend only
#   ./run.sh frontend Start frontend only
#   ./run.sh build    Build backend from source
#   ./run.sh status   Show running services

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PID_FILE="$SCRIPT_DIR/.atlas-pids"

# Ctrl+C kills all child processes
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  if [ -f "$PID_FILE" ]; then
    while IFS=: read -r name pid; do
      kill "$pid" 2>/dev/null && echo "  Stopped $name (PID $pid)" || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}  ╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}  ║${NC}        ATLAS RACING v2.0.0           ${CYAN}║${NC}"
  echo -e "${CYAN}  ║${NC}   Real-time Sim Racing Telemetry     ${CYAN}║${NC}"
  echo -e "${CYAN}  ╚══════════════════════════════════════╝${NC}"
  echo ""
}

build_backend() {
  echo -e "${YELLOW}Building C++ backend...${NC}"
  cd "$BACKEND_DIR"
  mkdir -p build && cd build
  cmake .. -DCMAKE_BUILD_TYPE=Release 2>&1
  make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)" 2>&1
  echo -e "${GREEN}Backend built successfully.${NC}"
  cd "$SCRIPT_DIR"
}

start_backend() {
  local backend_bin=""

  if [ -f "$BACKEND_DIR/build/atlas_racing_server" ]; then
    backend_bin="$BACKEND_DIR/build/atlas_racing_server"
  elif [ -f "$BACKEND_DIR/build/telemetry_server" ]; then
    backend_bin="$BACKEND_DIR/build/telemetry_server"
  else
    echo -e "${YELLOW}Backend not built. Building now...${NC}"
    build_backend
    if [ -f "$BACKEND_DIR/build/atlas_racing_server" ]; then
      backend_bin="$BACKEND_DIR/build/atlas_racing_server"
    elif [ -f "$BACKEND_DIR/build/telemetry_server" ]; then
      backend_bin="$BACKEND_DIR/build/telemetry_server"
    else
      echo -e "${RED}Build failed — no backend binary found.${NC}"
      return 1
    fi
  fi

  echo -e "${GREEN}Starting backend: ${backend_bin}${NC}"
  "$backend_bin" &
  local pid=$!
  echo "backend:$pid" >> "$PID_FILE"
  echo -e "${GREEN}Backend running (PID $pid) — SSE on port 8080${NC}"
}

start_frontend() {
  cd "$FRONTEND_DIR"

  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
  fi

  echo -e "${GREEN}Starting frontend on port 3000...${NC}"
  BROWSER=none npm start &
  local pid=$!
  echo "frontend:$pid" >> "$PID_FILE"
  echo -e "${GREEN}Frontend running (PID $pid) — http://localhost:3000${NC}"
  cd "$SCRIPT_DIR"
}

stop_services() {
  if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}No running services found.${NC}"
    # Also try to kill by port as fallback
    lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    return
  fi

  echo -e "${YELLOW}Stopping services...${NC}"
  while IFS=: read -r name pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo -e "  Stopped $name (PID $pid)"
    fi
  done < "$PID_FILE"

  rm -f "$PID_FILE"

  # Clean up any stragglers by port
  lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

  echo -e "${GREEN}All services stopped.${NC}"
}

show_status() {
  echo -e "${CYAN}Service Status:${NC}"
  echo ""

  if lsof -i:8080 -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "  Backend (port 8080):  ${GREEN}RUNNING${NC}"
  else
    echo -e "  Backend (port 8080):  ${RED}STOPPED${NC}"
  fi

  if lsof -i:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "  Frontend (port 3000): ${GREEN}RUNNING${NC} — http://localhost:3000"
  else
    echo -e "  Frontend (port 3000): ${RED}STOPPED${NC}"
  fi

  # Show LAN IP for device pairing
  local lan_ip
  lan_ip=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
  if [ "$lan_ip" != "unknown" ]; then
    echo ""
    echo -e "  ${CYAN}LAN URL: http://${lan_ip}:3000${NC}"
    echo -e "  Scan QR code in dashboard or open this URL on phone/tablet."
  fi
  echo ""
}

# ────────────────────────────────────────

banner

case "${1:-start}" in
  start)
    stop_services 2>/dev/null
    rm -f "$PID_FILE"
    echo -e "${CYAN}Starting all services...${NC}"
    echo ""
    start_backend
    sleep 2
    start_frontend
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    show_status
    echo -e "  Run ${YELLOW}./run.sh stop${NC} to shut down."
    echo -e "  Run ${YELLOW}./run.sh status${NC} to check services."
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    wait
    ;;
  stop)
    stop_services
    ;;
  backend)
    start_backend
    echo -e "  Run ${YELLOW}./run.sh stop${NC} to shut down."
    wait
    ;;
  frontend)
    start_frontend
    echo -e "  Run ${YELLOW}./run.sh stop${NC} to shut down."
    wait
    ;;
  build)
    build_backend
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: ./run.sh [start|stop|backend|frontend|build|status]"
    echo ""
    echo "  start     Start backend + frontend (default)"
    echo "  stop      Stop all running services"
    echo "  backend   Start backend only"
    echo "  frontend  Start frontend only"
    echo "  build     Build C++ backend from source"
    echo "  status    Show running services"
    ;;
esac

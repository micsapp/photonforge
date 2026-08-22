#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

# Color helpers
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Prefer Compose v2 plugin (`docker compose`), fall back to legacy binary
if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
else
    echo -e "${RED}[!] Neither 'docker compose' nor 'docker-compose' found.${NC}" >&2
    exit 1
fi

function print_usage() {
    echo -e "${BLUE}PhotonForge Management CLI${NC}"
    echo "Usage: ./manage.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start         Start PhotonForge services in background"
    echo "  stop          Stop all services"
    echo "  restart       Restart all services"
    echo "  status        Show container status"
    echo "  logs          Follow server logs"
    echo "  index         Trigger indexing of RAW originals (/photoprism/originals)"
    echo "  index-fast    Trigger fast index without recreating existing thumbnails"
    echo "  gpu-check     Check if Darktable & OpenCL GPU drivers are detected"
    echo "  shell         Open bash shell inside the PhotoPrism container"
    echo "  help          Show this help message"
}

case "$1" in
    start)
        echo -e "${GREEN}[+] Starting PhotonForge...${NC}"
        $DC up -d
        echo -e "${GREEN}[✔] PhotonForge is starting at http://localhost:2342${NC}"
        ;;
    stop)
        echo -e "${YELLOW}[-] Stopping PhotonForge...${NC}"
        $DC down
        ;;
    restart)
        echo -e "${YELLOW}[!] Restarting PhotonForge...${NC}"
        $DC restart
        ;;
    status)
        $DC ps
        ;;
    logs)
        $DC logs -f photoprism
        ;;
    index)
        echo -e "${BLUE}[*] Starting full index of RAW files...${NC}"
        $DC exec photoprism photoprism index
        ;;
    index-fast)
        echo -e "${BLUE}[*] Starting fast index...${NC}"
        $DC exec photoprism photoprism index --cleanup=false
        ;;
    gpu-check)
        echo -e "${BLUE}[*] Checking GPU & Darktable OpenCL acceleration inside container...${NC}"
        $DC exec photoprism darktable-cli --version || true
        $DC exec photoprism photoprism config | grep -iE 'gpu|darktable|raw|workers' || true
        ;;
    shell)
        $DC exec photoprism bash
        ;;
    *)
        print_usage
        exit 1
        ;;
esac

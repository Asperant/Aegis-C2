#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -t 1 ]]; then
  BLUE='\033[0;34m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  NC='\033[0m'
else
  BLUE='' GREEN='' YELLOW='' RED='' NC=''
fi

timestamp() { date +"%Y-%m-%d %H:%M:%S"; }
log_info()  { echo -e "${BLUE}[$(timestamp)] [INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[$(timestamp)] [WARN]${NC} $*"; }
log_error() { echo -e "${RED}[$(timestamp)] [ERROR]${NC} $*" >&2; }
log_ok()    { echo -e "${GREEN}[$(timestamp)] [OK]${NC} $*"; }

on_error() {
  log_error "Shutdown failed at line $1."
  exit 1
}
trap 'on_error $LINENO' ERR

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

log_info "Stopping Aegis C2 Kubernetes deployment."
require_cmd minikube

log_info "Step 1/2: Uninstalling Helm release."
if [[ -x ./helm_cmd ]]; then
  if ./helm_cmd uninstall aegis -n default >/dev/null 2>&1; then
    log_ok "Helm release 'aegis' uninstalled."
  else
    log_warn "Helm release 'aegis' is not present or could not be removed."
  fi
else
  log_warn "./helm_cmd not found or not executable. Skipping Helm uninstall."
fi

log_info "Step 2/2: Stopping Minikube."
if minikube stop; then
  log_ok "Minikube stopped successfully."
else
  log_error "Minikube stop command failed."
  exit 1
fi

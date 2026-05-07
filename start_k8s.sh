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
  log_error "Deployment failed at line $1."
  exit 1
}
trap 'on_error $LINENO' ERR

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

require_file() {
  if [[ ! -f "$1" ]]; then
    log_error "Required file not found: $1"
    exit 1
  fi
}

require_env() {
  local key="$1"
  : "${!key:?Environment variable '${key}' must be set in .env}"
}

log_info "Starting Aegis C2 Kubernetes deployment."

require_cmd minikube
require_cmd kubectl
require_cmd docker
require_file ".env"
require_file "./helm_cmd"
require_file "keys/gks_private.pem"
require_file "keys/gks_public.pem"
require_file "keys/uav_private.pem"
require_file "keys/uav_public.pem"

set -a
source .env
set +a

require_env DB_USER
require_env DB_PASS
require_env DB_NAME
require_env JWT_SECRET
require_env JWT_ISSUER
require_env JWT_AUDIENCE
require_env AUTH_USERNAME
require_env AUTH_PASSWORD

log_info "Step 1/4: Starting Minikube cluster."
minikube start
MINIKUBE_IP="$(minikube ip)"
log_ok "Minikube is running at ${MINIKUBE_IP}."

log_info "Step 2/4: Building images in Minikube Docker daemon."
eval "$(minikube docker-env)"
docker compose build
log_ok "Container images built successfully."

log_info "Step 3/4: Applying Kubernetes secret for crypto keys."
kubectl create secret generic crypto-keys \
  --from-file=gks_private.pem=keys/gks_private.pem \
  --from-file=gks_public.pem=keys/gks_public.pem \
  --from-file=uav_private.pem=keys/uav_private.pem \
  --from-file=uav_public.pem=keys/uav_public.pem \
  --dry-run=client -o yaml | kubectl apply -f -
log_ok "Crypto key secret applied."

log_info "Step 4/5: Deploying Helm chart."
chmod +x ./helm_cmd
HELM_SET_ARGS=(
  --set-string "database.user=${DB_USER}"
  --set-string "database.password=${DB_PASS}"
  --set-string "database.name=${DB_NAME}"
  --set-string "jwt.secret=${JWT_SECRET}"
  --set-string "jwt.issuer=${JWT_ISSUER}"
  --set-string "jwt.audience=${JWT_AUDIENCE}"
  --set-string "auth.username=${AUTH_USERNAME}"
  --set-string "auth.password=${AUTH_PASSWORD}"
  --set-string "frontend.url=http://${MINIKUBE_IP}:30002"
  --set-string "frontend.apiUrl=http://${MINIKUBE_IP}:30001/api"
  --set-string "frontend.hubUrl=http://${MINIKUBE_IP}:30001/telemetryHub"
)
./helm_cmd upgrade --install aegis ./helm/aegis -n default --create-namespace --wait "${HELM_SET_ARGS[@]}"
log_ok "Helm deployment completed."

log_info "Step 5/5: Verifying PostgreSQL database bootstrap."
DB_POD="$(kubectl get pod -n default -l app=aegis-db -o jsonpath='{.items[0].metadata.name}')"
if [[ -z "${DB_POD}" ]]; then
  log_error "aegis-db pod could not be found."
  exit 1
fi

kubectl wait --for=condition=ready "pod/${DB_POD}" -n default --timeout=120s >/dev/null

DB_EXISTS="$(kubectl exec -n default "${DB_POD}" -- env PGPASSWORD="${DB_PASS}" \
  psql -h 127.0.0.1 -U "${DB_USER}" -d template1 -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"

if [[ "${DB_EXISTS}" != "1" ]]; then
  log_warn "Database '${DB_NAME}' not found. Creating it now."
  kubectl exec -n default "${DB_POD}" -- env PGPASSWORD="${DB_PASS}" \
    psql -h 127.0.0.1 -U "${DB_USER}" -d template1 -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${DB_NAME}\""
fi

kubectl exec -i -n default "${DB_POD}" -- env PGPASSWORD="${DB_PASS}" \
  psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 \
  < helm/aegis/init.sql
log_ok "PostgreSQL database '${DB_NAME}' is ready."

log_ok "Aegis C2 is ready on Kubernetes."
echo
echo "UI URL:      http://${MINIKUBE_IP}:30002"
echo "API URL:     http://${MINIKUBE_IP}:30001/api"
echo "SignalR URL: http://${MINIKUBE_IP}:30001/telemetryHub"
echo
log_warn "This script deploys only Kubernetes resources (not Docker Compose runtime)."
log_info "Check workload status with: kubectl get pods"

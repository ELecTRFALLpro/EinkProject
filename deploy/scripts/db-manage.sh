#!/usr/bin/env bash
# ==============================================================================
# EinkFrame — Minikube PostgreSQL 16 运维与本地开发辅助脚本
# 用法:
#   ./deploy/scripts/db-manage.sh up       # 启动 Minikube 并部署 PostgreSQL StatefulSet + 初始化表结构
#   ./deploy/scripts/db-manage.sh status   # 查看 K8s Pod、PVC、Service 状态
#   ./deploy/scripts/db-manage.sh forward  # 端口转发 K8s PostgreSQL 到宿主机 127.0.0.1:5432
#   ./deploy/scripts/db-manage.sh cli      # 进入容器内 psql 交互式命令行
#   ./deploy/scripts/db-manage.sh init-sql # 手动重新执行 deploy/sql/init_schema.sql
#   ./deploy/scripts/db-manage.sh run-api  # 使用 PostgreSQL 模式启动 Go 后端服务 (:8080)
#   ./deploy/scripts/db-manage.sh down     # 销毁 K8s 中的 PostgreSQL 实例（保留或清理视需求）
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
K8S_MANIFEST="${ROOT_DIR}/deploy/k8s/postgres.yaml"
SQL_INIT_FILE="${ROOT_DIR}/deploy/sql/init_schema.sql"
NAMESPACE="eink-system"
POD_NAME="eink-postgres-0"
SVC_NAME="eink-postgres-svc"

DB_USER="eink_user"
DB_PASS="eink_pass_2026"
DB_NAME="eink_db"
LOCAL_PORT="5432"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

ensure_minikube() {
  if ! command -v minikube >/dev/null 2>&1; then
    err "未检测到 minikube，请先安装: brew install minikube"
    exit 1
  fi
  if ! minikube status >/dev/null 2>&1; then
    info "Minikube 尚未运行，正在启动 Minikube 集群..."
    minikube start --memory=2200mb --cpus=2
  else
    ok "Minikube 集群正在运行"
  fi
}

cmd_up() {
  ensure_minikube
  info "正在应用 Kubernetes 清单: ${K8S_MANIFEST}"
  kubectl apply -f "${K8S_MANIFEST}"

  info "等待 PostgreSQL Pod (${POD_NAME}) 就绪..."
  kubectl wait --namespace "${NAMESPACE}" \
    --for=condition=ready pod/"${POD_NAME}" \
    --timeout=120s

  ok "PostgreSQL 16 实例已在 Minikube 中就绪！"

  info "正在同步幂等初始化建表脚本 (${SQL_INIT_FILE})..."
  kubectl exec -i -n "${NAMESPACE}" "${POD_NAME}" -- \
    psql -U "${DB_USER}" -d "${DB_NAME}" < "${SQL_INIT_FILE}"

  ok "数据库表结构校验/初始化完成！"
  echo ""
  cmd_status
  echo ""
  info "下一步建议："
  echo "  1. 另开终端执行端口转发: ./deploy/scripts/db-manage.sh forward"
  echo "  2. 启动 Go 后端连接 PG : ./deploy/scripts/db-manage.sh run-api"
  echo "  3. 进入数据库交互终端  : ./deploy/scripts/db-manage.sh cli"
}

cmd_status() {
  info "Namespace [${NAMESPACE}] 资源状态："
  kubectl get pods,pvc,svc -n "${NAMESPACE}" -o wide
}

cmd_forward() {
  info "正在将 K8s ${NAMESPACE}/${SVC_NAME}:5432 转发至宿主机 127.0.0.1:${LOCAL_PORT} ..."
  info "宿主机 DSN: postgres://${DB_USER}:${DB_PASS}@127.0.0.1:${LOCAL_PORT}/${DB_NAME}?sslmode=disable"
  kubectl port-forward -n "${NAMESPACE}" "svc/${SVC_NAME}" "${LOCAL_PORT}:5432"
}

cmd_cli() {
  info "正在进入 ${POD_NAME} 的 PostgreSQL 交互终端 (输入 \\q 退出，\\dt 查看表)..."
  kubectl exec -it -n "${NAMESPACE}" "${POD_NAME}" -- \
    psql -U "${DB_USER}" -d "${DB_NAME}"
}

cmd_init_sql() {
  info "正在向 ${POD_NAME} 执行 ${SQL_INIT_FILE} ..."
  kubectl exec -i -n "${NAMESPACE}" "${POD_NAME}" -- \
    psql -U "${DB_USER}" -d "${DB_NAME}" < "${SQL_INIT_FILE}"
  ok "SQL 脚本执行完毕！"
}

cmd_run_api() {
  export DB_DRIVER="postgres"
  export DB_DSN="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:${LOCAL_PORT}/${DB_NAME}?sslmode=disable"
  export PORT="${PORT:-8080}"

  info "正在以 PostgreSQL 模式启动 Go 后端服务..."
  info "DB_DRIVER=${DB_DRIVER}"
  info "DB_DSN=${DB_DSN}"
  cd "${ROOT_DIR}/server"
  go run ./cmd/api/main.go
}

cmd_down() {
  warn "即将从 Minikube 中删除 ${K8S_MANIFEST} 定义的资源..."
  kubectl delete -f "${K8S_MANIFEST}" --ignore-not-found=true
  ok "已清理 K8s PostgreSQL 资源。"
}

ACTION="${1:-help}"
case "${ACTION}" in
  up)       cmd_up ;;
  status)   cmd_status ;;
  forward)  cmd_forward ;;
  cli)      cmd_cli ;;
  init-sql) cmd_init_sql ;;
  run-api)  cmd_run_api ;;
  down)     cmd_down ;;
  *)
    echo "用法: $0 {up|status|forward|cli|init-sql|run-api|down}"
    exit 1
    ;;
esac


#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$SCRIPT_DIR/.run"
PID_FILE="$RUN_DIR/studio.pid"
INFO_FILE="$RUN_DIR/studio.env"
COMMAND="${1:-start}"
STUDIO_CHILD_PID=""

mkdir -p "$RUN_DIR"

is_studio_process() {
  local candidate_pid="$1"
  if ! kill -0 "$candidate_pid" 2>/dev/null; then
    return 1
  fi
  local candidate_command
  candidate_command="$(ps -p "$candidate_pid" -o command= 2>/dev/null || true)"
  [[ "$candidate_command" == *"server/index.ts"* ]]
}

read_managed_pid() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local recorded_pid
  recorded_pid="$(tr -cd '0-9' < "$PID_FILE")"
  if [[ -z "$recorded_pid" ]] || ! is_studio_process "$recorded_pid"; then
    rm -f "$PID_FILE" "$INFO_FILE"
    return 1
  fi
  printf '%s' "$recorded_pid"
}

stop_existing() {
  local existing_pid
  if ! existing_pid="$(read_managed_pid)"; then
    echo "ReAct Studio 当前未由此脚本运行。"
    return 0
  fi

  echo "正在停止 ReAct Studio (PID $existing_pid)..."
  kill -TERM "$existing_pid" 2>/dev/null || true
  for _ in {1..50}; do
    if ! kill -0 "$existing_pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "$existing_pid" 2>/dev/null; then
    echo "服务未及时退出，发送 KILL。"
    kill -KILL "$existing_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE" "$INFO_FILE"
}

cleanup() {
  local exit_code=$?
  trap - EXIT HUP INT TERM
  if [[ -n "$STUDIO_CHILD_PID" ]] && is_studio_process "$STUDIO_CHILD_PID"; then
    echo
    echo "终端退出，正在关闭 Studio 与托管的 OpenCode..."
    kill -TERM "$STUDIO_CHILD_PID" 2>/dev/null || true
    wait "$STUDIO_CHILD_PID" 2>/dev/null || true
  fi
  if [[ -f "$PID_FILE" ]] && [[ "$(tr -cd '0-9' < "$PID_FILE")" == "$STUDIO_CHILD_PID" ]]; then
    rm -f "$PID_FILE" "$INFO_FILE"
  fi
  exit "$exit_code"
}

show_status() {
  local existing_pid
  if ! existing_pid="$(read_managed_pid)"; then
    echo "ReAct Studio 未运行。"
    return 1
  fi
  echo "ReAct Studio 正在运行 (PID $existing_pid)。"
  if [[ -f "$INFO_FILE" ]]; then
    # Values are generated numeric ports and a localhost URL, not executable input.
    sed -n '1,3p' "$INFO_FILE"
  fi
}

start_foreground() {
  if [[ ! -x "$SCRIPT_DIR/node_modules/.bin/tsx" ]]; then
    echo "缺少依赖，请先在项目目录运行：npm install" >&2
    exit 1
  fi
  if read_managed_pid >/dev/null; then
    echo "ReAct Studio 已在运行。使用 '$0 restart' 重启。" >&2
    exit 1
  fi

  local selected_ports
  if ! selected_ports="$(node "$SCRIPT_DIR/scripts/find-free-ports.mjs")"; then
    exit 1
  fi
  local selected_studio_port selected_opencode_port
  read -r selected_studio_port selected_opencode_port <<< "$selected_ports"

  export STUDIO_PORT="$selected_studio_port"
  export OPENCODE_PORT="$selected_opencode_port"
  export OPENCODE_URL="http://127.0.0.1:$selected_opencode_port"
  export OPENCODE_MANAGED=1

  cat > "$INFO_FILE" <<EOF
URL=http://127.0.0.1:$selected_studio_port
STUDIO_PORT=$selected_studio_port
OPENCODE_PORT=$selected_opencode_port
EOF

  trap cleanup EXIT HUP INT TERM
  echo "Studio 端口：$selected_studio_port"
  echo "OpenCode 端口：$selected_opencode_port"
  echo "访问地址：http://127.0.0.1:$selected_studio_port"
  echo "关闭当前终端或按 Ctrl-C 会自动停止全部服务。"
  echo

  cd "$SCRIPT_DIR"
  node --import tsx "$SCRIPT_DIR/server/index.ts" &
  STUDIO_CHILD_PID=$!
  printf '%s\n' "$STUDIO_CHILD_PID" > "$PID_FILE"
  wait "$STUDIO_CHILD_PID"
}

case "$COMMAND" in
  start)
    start_foreground
    ;;
  restart)
    stop_existing
    start_foreground
    ;;
  stop)
    stop_existing
    ;;
  status)
    show_status
    ;;
  *)
    echo "用法：$0 [start|restart|stop|status]" >&2
    exit 2
    ;;
esac

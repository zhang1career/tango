#!/usr/bin/env bash
# 后台冒烟脚本：稳定运行，监听外部请求（0.0.0.0）
# 日志输出到 /var/log/<APP_NAME>/app.log
# 通用机制：通过 .env 中的 APP_NAME 配置，可复用到其他项目

set -e
cd "$(dirname "$0")/.."

# 从 .env 读取 APP_NAME，未设置则用 package.json 的 name 或 ta
if [ -f .env ]; then
  APP_NAME=$(grep -E '^APP_NAME=' .env 2>/dev/null | cut -d= -f2- | tr -d $'"\'\r ' | xargs) || true
fi
APP_NAME=${APP_NAME:-ta}

LOG_DIR="/var/log/${APP_NAME}"
LOG_FILE="${LOG_DIR}/app.log"
RUN_DIR="/var/run/${APP_NAME}"
PID_FILE="${RUN_DIR}/app.pid"

# 创建日志目录（可能需要 sudo）
mkdir -p "$LOG_DIR" 2>/dev/null || {
  echo "无法创建 ${LOG_DIR}，尝试使用 sudo..."
  sudo mkdir -p "$LOG_DIR"
  sudo chown "$(whoami)" "$LOG_DIR" 2>/dev/null || true
}

# 若已有进程在跑，先停止
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "已有进程 $OLD_PID 在运行，正在停止..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$PID_FILE"
fi

# 后台启动：--host 使 Vite 监听 0.0.0.0
echo "启动服务：APP_NAME=${APP_NAME} 日志=${LOG_FILE}"
nohup npm run dev -- --host >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "已启动，PID=$(cat $PID_FILE)"
echo "查看日志: tail -f ${LOG_FILE}"

#!/bin/bash

set -u

MILESTONE_INPUT="${1:-}"
if [ -z "$MILESTONE_INPUT" ]; then
  echo "用法: bash scripts/checkpoint.sh <里程碑名>"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MILESTONE=$(echo "$MILESTONE_INPUT" | tr ' /:' '___')
DIR="checkpoints/${MILESTONE}_${TIMESTAMP}"
LOG_FILE="checkpoints/log.md"
STATUS_FILE="$DIR/status.txt"
BUILD_LOG="$DIR/build.log"
DEV_LOG="$DIR/dev.log"
SCREENSHOT_LOG="$DIR/screenshot.log"

CHECKPOINT_URL="${CHECKPOINT_URL:-http://127.0.0.1:4173}"
CHECKPOINT_BUILD_CMD="${CHECKPOINT_BUILD_CMD:-npm run build:checkpoint}"
CHECKPOINT_DEV_CMD="${CHECKPOINT_DEV_CMD:-npm run dev:renderer}"

mkdir -p "$DIR"
mkdir -p "checkpoints"

# 记录基础信息
{
  echo "milestone=$MILESTONE_INPUT"
  echo "timestamp=$TIMESTAMP"
  echo "url=$CHECKPOINT_URL"
  echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "$STATUS_FILE"

# 1) 构建并记录输出
{
  echo "=== Build Command ==="
  echo "$CHECKPOINT_BUILD_CMD"
  echo
  echo "=== Build Output ==="
} > "$BUILD_LOG"

bash -lc "$CHECKPOINT_BUILD_CMD" >> "$BUILD_LOG" 2>&1
BUILD_EXIT_CODE=$?
echo "build_exit_code=$BUILD_EXIT_CODE" >> "$STATUS_FILE"

# 2) 启动渲染服务并尝试截图
bash -lc "$CHECKPOINT_DEV_CMD" > "$DEV_LOG" 2>&1 &
SERVER_PID=$!
echo "dev_server_pid=$SERVER_PID" >> "$STATUS_FILE"

# 等待服务就绪（最多 45 秒）
READY=0
for _ in $(seq 1 45); do
  if curl -s -o /dev/null "$CHECKPOINT_URL"; then
    READY=1
    break
  fi
  sleep 1
done

echo "dev_ready=$READY" >> "$STATUS_FILE"

SCREENSHOT_RESULT="not_attempted"
if [ "$READY" -eq 1 ]; then
  HTTP_STATUS=$(curl -s -o "$DIR/response.html" -w '%{http_code}' "$CHECKPOINT_URL")
  echo "http_status=$HTTP_STATUS" >> "$STATUS_FILE"

  if npx --no-install playwright --version >"$SCREENSHOT_LOG" 2>&1; then
    npx playwright screenshot --browser chromium "$CHECKPOINT_URL" "$DIR/screenshot.png" --full-page >>"$SCREENSHOT_LOG" 2>&1
    PLAYWRIGHT_EXIT_CODE=$?
    if [ "$PLAYWRIGHT_EXIT_CODE" -eq 0 ] && [ -f "$DIR/screenshot.png" ]; then
      SCREENSHOT_RESULT="playwright_ok"
    else
      SCREENSHOT_RESULT="playwright_failed"
    fi
  else
    SCREENSHOT_RESULT="playwright_missing"
  fi
else
  echo "http_status=000" >> "$STATUS_FILE"
fi

echo "screenshot_result=$SCREENSHOT_RESULT" >> "$STATUS_FILE"

# 关闭 dev server
kill "$SERVER_PID" >/dev/null 2>&1
wait "$SERVER_PID" >/dev/null 2>&1 || true

# 3) 保存变更摘要
git diff > "$DIR/changes.diff"
git diff --stat > "$DIR/summary.txt"
git status --short > "$DIR/git-status.txt"

# 4) 追加日志
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" <<'LOGEOF'
# Checkpoints 日志

LOGEOF
fi

{
  echo "## $TIMESTAMP - $MILESTONE_INPUT"
  echo "- 目录：\`$DIR\`"
  echo "- 构建日志：\`$BUILD_LOG\`"
  echo "- 构建退出码：\`$BUILD_EXIT_CODE\`"
  echo "- 服务日志：\`$DEV_LOG\`"
  echo "- 截图结果：\`$SCREENSHOT_RESULT\`"
  echo "- 截图日志：\`$SCREENSHOT_LOG\`"
  if [ -f "$DIR/screenshot.png" ]; then
    echo "- 截图文件：\`$DIR/screenshot.png\`"
  fi
  echo "- HTTP 状态：\`$(grep '^http_status=' "$STATUS_FILE" | cut -d'=' -f2)\`"
  echo "- 代码摘要：\`$DIR/summary.txt\`"
  echo
} >> "$LOG_FILE"

echo "✅ Checkpoint $MILESTONE_INPUT 已保存到 $DIR"
echo "📝 日志已追加到 $LOG_FILE"

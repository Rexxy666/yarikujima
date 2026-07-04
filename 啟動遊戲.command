#!/bin/bash
# 雙擊此檔即可啟動浮島記帳後端（含 Gemini 聊天）。關閉此視窗即停止伺服器。
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 Node.js，請先安裝：https://nodejs.org （下載 LTS 版，安裝後再雙擊此檔）"
  echo "按任意鍵關閉…"; read -n 1; exit 1
fi

echo "正在啟動浮島記帳…稍候會自動打開瀏覽器"
( sleep 1.5; open "http://localhost:${PORT:-8787}" ) &
node server.js
echo "伺服器已停止。按任意鍵關閉…"; read -n 1

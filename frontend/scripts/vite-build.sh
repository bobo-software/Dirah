#!/bin/sh
set -eu

if [ -z "${VITE_API_URL:-}" ]; then
  echo "Missing VITE_API_URL."
  exit 1
fi

case "$VITE_API_URL" in
  http://*|https://*) ;;
  *) VITE_API_URL="https://${VITE_API_URL}" ;;
esac
export VITE_API_URL

npm run build

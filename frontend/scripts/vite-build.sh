#!/bin/sh
set -eu

# The browser calls its own origin; nginx proxies /api to the backend. This is
# the API origin shown to users and called by outside clients (MCP connectors).
if [ -z "${VITE_PUBLIC_API_URL:-}" ]; then
  echo "Missing VITE_PUBLIC_API_URL (the API origin shown to users, e.g. https://api.example.com)."
  exit 1
fi

case "$VITE_PUBLIC_API_URL" in
  http://*|https://*) ;;
  *) VITE_PUBLIC_API_URL="https://${VITE_PUBLIC_API_URL}" ;;
esac
export VITE_PUBLIC_API_URL

# Optional escape hatch for an API on another origin. Leave unset in production.
if [ -n "${VITE_API_URL:-}" ]; then
  case "$VITE_API_URL" in
    http://*|https://*) ;;
    *) VITE_API_URL="https://${VITE_API_URL}" ;;
  esac
  export VITE_API_URL
fi

npm run build

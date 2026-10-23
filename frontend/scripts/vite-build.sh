#!/bin/sh
set -eu

# Optional. If set, this is the API origin shown to users (MCP connectors).
# If unset, the client uses the page origin at runtime, which is what a
# same-origin self-hosted install wants. The hosted build sets it explicitly.
if [ -n "${VITE_PUBLIC_API_URL:-}" ]; then
  case "$VITE_PUBLIC_API_URL" in
    http://*|https://*) ;;
    *) VITE_PUBLIC_API_URL="https://${VITE_PUBLIC_API_URL}" ;;
  esac
  export VITE_PUBLIC_API_URL
fi

# Optional escape hatch for an API on another origin. Leave unset in production.
if [ -n "${VITE_API_URL:-}" ]; then
  case "$VITE_API_URL" in
    http://*|https://*) ;;
    *) VITE_API_URL="https://${VITE_API_URL}" ;;
  esac
  export VITE_API_URL
fi

npm run build

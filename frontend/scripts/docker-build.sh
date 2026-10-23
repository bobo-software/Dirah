#!/bin/sh
set -eu

token=""
if [ -f /run/secrets/infisical_token ]; then
  token=$(cat /run/secrets/infisical_token)
elif [ -n "${INFISICAL_TOKEN:-}" ]; then
  token=$INFISICAL_TOKEN
fi

if [ -n "$token" ] && [ -n "${INFISICAL_DOMAIN:-}" ] && [ -n "${INFISICAL_ENV:-}" ]; then
  exec infisical run \
    --token="$token" \
    --domain="$INFISICAL_DOMAIN" \
    --env="$INFISICAL_ENV" \
    -- sh ./scripts/vite-build.sh
fi

echo "Infisical not configured; building with VITE_* build args."
exec sh ./scripts/vite-build.sh

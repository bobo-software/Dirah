#!/bin/sh
set -eu

if [ -n "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_ENV:-}" ] && [ -n "${INFISICAL_DOMAIN:-}" ]; then
  exec infisical run \
    --token="$INFISICAL_TOKEN" \
    --domain="$INFISICAL_DOMAIN" \
    --env="$INFISICAL_ENV" \
    -- node dist/server.js
fi

exec node dist/server.js

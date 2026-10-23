#!/bin/sh
set -eu

token=""
if [ -f /run/secrets/infisical_token ]; then
  token=$(cat /run/secrets/infisical_token)
elif [ -n "${INFISICAL_TOKEN:-}" ]; then
  token=$INFISICAL_TOKEN
fi

# A Vite build executes third-party code, so fetch only the one public value it
# needs instead of injecting every prod secret into the build. A build arg still
# wins when Infisical has nothing for the key.
if [ -n "$token" ] && [ -n "${INFISICAL_DOMAIN:-}" ] && [ -n "${INFISICAL_ENV:-}" ]; then
  from_infisical=$(infisical secrets get VITE_PUBLIC_API_URL \
    --token="$token" \
    --domain="$INFISICAL_DOMAIN" \
    --env="$INFISICAL_ENV" \
    --plain \
    --silent)
  if [ -n "$from_infisical" ]; then
    VITE_PUBLIC_API_URL=$from_infisical
    export VITE_PUBLIC_API_URL
  fi
fi

exec sh ./scripts/vite-build.sh

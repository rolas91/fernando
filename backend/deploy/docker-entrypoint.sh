#!/bin/sh
set -eu
: "${DB_HOST:?Set DB_HOST explicitly}"
: "${DB_USER:?Set DB_USER explicitly}"
: "${DB_PASSWORD:?Set DB_PASSWORD explicitly}"
: "${DB_NAME:?Set DB_NAME explicitly}"
: "${JWT_SECRET:?Set JWT_SECRET explicitly}"
if [ "${NODE_ENV:-production}" = production ] && [ "${DB_SYNCHRONIZE:-false}" != false ]; then
  echo 'Production requires DB_SYNCHRONIZE=false. Apply versioned migrations explicitly.' >&2
  exit 1
fi
if [ "${AUTH_DEV_BYPASS:-false}" != false ]; then
  echo 'Container deployments require AUTH_DEV_BYPASS=false.' >&2
  exit 1
fi
exec "$@"

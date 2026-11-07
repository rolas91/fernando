#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "$0")"
role="${1:-}"
image="${2:-}"
migrate="${3:-false}"
[[ "$role" == api || "$role" == web ]] || { echo 'Usage: deploy.sh api|web ghcr.io/owner/image@sha256:DIGEST [true|false]' >&2; exit 2; }
[[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || { echo 'Use an immutable GHCR image digest' >&2; exit 2; }
[[ "$migrate" == true || "$migrate" == false ]] || exit 2
[[ "$role" == api || "$migrate" == false ]] || { echo 'Only API deployments can apply migrations' >&2; exit 2; }
for file in .env.production .env.images compose.production.yml Caddyfile; do [[ -f "$file" ]] || { echo "Missing $file; complete VPS setup first" >&2; exit 2; }; done
command -v flock >/dev/null || { echo 'Install util-linux (flock)' >&2; exit 2; }
exec 9>.deploy.lock
flock -w 600 9 || { echo 'Another release is in progress' >&2; exit 1; }
compose=(docker compose --env-file .env.production --env-file .env.images -f compose.production.yml)
"${compose[@]}" config --quiet
edge="$(sed -n 's/^EDGE_PROXY=//p' .env.production | tr -d '\r' | tail -n 1)"
edge="${edge:-caddy}"
[[ "$edge" == caddy || "$edge" == external ]] || { echo 'EDGE_PROXY must be caddy or external' >&2; exit 2; }
services=(api web)
[[ "$edge" == external ]] || services+=(caddy)
mkdir -p .releases
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup=".releases/$stamp.env.images"
cp -- .env.images "$backup"
candidate="$(mktemp .env.images.XXXXXX)"
trap 'rm -f -- "$candidate"' EXIT
key=API_IMAGE; [[ "$role" == web ]] && key=WEB_IMAGE
# Preserve the other application's pinned digest. Never source an environment file as shell code.
grep -v "^$key=" .env.images > "$candidate" || true
printf '%s=%s\n' "$key" "$image" >> "$candidate"
mv -- "$candidate" .env.images
rollback() {
  local status=$?
  [[ "$status" != 0 ]] || status=1
  trap - ERR INT TERM HUP
  echo 'Release failed; restoring previous application images' >&2
  cp -- "$backup" .env.images
  "${compose[@]}" up -d --wait --wait-timeout 180 "${services[@]}" || echo 'Automatic rollback failed; inspect docker compose logs' >&2
  echo 'Database migrations, if requested, are not automatically reverted.' >&2
  exit "$status"
}
trap rollback ERR INT TERM HUP
"${compose[@]}" config --quiet
"${compose[@]}" pull "$role"
if [[ "$migrate" == true ]]; then
  echo 'Applying explicitly requested migrations; take a verified database backup first.'
  "${compose[@]}" --profile tools run --rm --no-deps migrate
fi
"${compose[@]}" up -d --wait --wait-timeout 180 "${services[@]}"
# Verify the proxy-to-API path as well as container health. Docker DNS may take a few seconds to refresh.
healthy=false
for attempt in {1..12}; do
  if "${compose[@]}" exec -T web wget -qO- http://127.0.0.1:8080/api-healthz >/dev/null; then healthy=true; break; fi
  sleep 5
done
[[ "$healthy" == true ]]
trap - ERR INT TERM HUP
printf '%s role=%s image=%s previous=%s\n' "$stamp" "$role" "$image" "$backup" >> .releases/history.log
echo "Release healthy: $role $image"

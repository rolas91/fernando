#!/usr/bin/env bash
# Run by GitHub over SSH; never changes database schema or runtime secrets.
set -Eeuo pipefail
umask 077
target="${1:-}"; api="${2:-}"; web="${3:-}"; release="${4:-}"; health="${5:-}"
[[ "$target" == dev || "$target" == production ]] || exit 2
[[ "$release" =~ ^[0-9]+-[0-9]+$ ]] || exit 2
[[ "$api" =~ ^ghcr\.io/rolas91/fernando-api@sha256:[a-f0-9]{64}$ ]] || exit 2
[[ "$web" =~ ^ghcr\.io/rolas91/fernando-web@sha256:[a-f0-9]{64}$ ]] || exit 2
if [[ "$target" == dev ]]; then
  cd /opt/dr-workops-test
  base=(docker compose --env-file .env.dev -f compose.dev.yml)
  [[ "$health" == https://dev.drworkops.com/api-healthz ]] || exit 2
else
  cd /opt/dr-workops
  base=(docker compose --env-file .env.production --env-file .env.images -f compose.production.yml)
  [[ "$health" == https://drworkops.com/api-healthz ]] || exit 2
fi
# Same lock as the existing deploy.sh; manual and automated releases cannot overlap.
exec 9>.deploy.lock
flock -w 600 9
mkdir -p .releases
snapshot=".releases/$(date -u +%Y%m%dT%H%M%SZ)-$release-$$"
mkdir "$snapshot"
override=.release-images.json
current=("${base[@]}")
[[ ! -f "$override" ]] || current+=(-f "$override")
"${current[@]}" config --format json | python3 -c '
import json,sys
c=json.load(sys.stdin)
for key in ("api","web"):
    if key not in c["services"]: raise SystemExit("Missing service")
print(json.dumps({"services":{k:{"image":c["services"][k]["image"]} for k in ("api","web")}}))
' > "$snapshot/previous-images.json"
[[ "$target" != production ]] || cp -p .env.images "$snapshot/previous.env.images"
# Pull before changing the active release. No mutable tags and no migrations.
docker pull "$api"
docker pull "$web"
compose=("${base[@]}" -f "$override")
rollback() {
  local status=$?
  [[ "$status" != 0 ]] || status=1
  trap - ERR INT TERM HUP
  echo 'Release failed; restoring previous application images' >&2
  cp "$snapshot/previous-images.json" "$override"
  [[ "$target" != production ]] || cp -p "$snapshot/previous.env.images" .env.images
  "${compose[@]}" up -d --wait --wait-timeout 180 api web || echo 'Rollback needs operator attention' >&2
  exit "$status"
}
trap rollback ERR INT TERM HUP
python3 - "$override" "$api" "$web" "$target" <<'PY'
import json,os,sys
out,api,web,target=sys.argv[1:]
with open(out+'.tmp','w') as f: json.dump({'services':{'api':{'image':api},'web':{'image':web}}},f)
os.replace(out+'.tmp',out)
if target=='production':
    with open('.env.images') as f: lines=[s for s in f if not s.startswith(('API_IMAGE=','WEB_IMAGE='))]
    with open('.env.images.tmp','w') as f: f.writelines(lines); f.write('\nAPI_IMAGE='+api+'\nWEB_IMAGE='+web+'\n')
    os.replace('.env.images.tmp','.env.images')
PY
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 180 api web
healthy=false
for attempt in {1..12}; do
  if "${compose[@]}" exec -T --interactive=false web wget -qO- http://127.0.0.1:8080/api-healthz >/dev/null; then healthy=true; break; fi
  sleep 5
done
[[ "$healthy" == true ]]
curl --fail --silent --show-error --retry 5 --retry-delay 2 --max-time 15 "$health" >/dev/null
python3 - "$snapshot/release.json" "$target" "$release" "$api" "$web" <<'PY'
import json,sys
out,target,release,api,web=sys.argv[1:]
with open(out,'w') as f: json.dump(dict(environment=target,release=release,api=api,web=web),f)
PY
cp "$snapshot/release.json" .release-current.json
printf '%s environment=%s release=%s snapshot=%s\n' "$(date -u +%FT%TZ)" "$target" "$release" "$snapshot" >> .releases/automation-history.log
trap - ERR INT TERM HUP
echo "Release healthy: $target $release"

#!/usr/bin/env bash
# Deploys one commit on the VPS. Called by .github/workflows/deploy.yml over SSH:
#   bash scripts/deploy.sh <commit-sha>
#
# One-time setup on the server (see docs/ci-cd.md):
#   backend/.env                    database, mail, Cloudinary, JWT secrets, PORT
#   frontend/.env.production.local  REACT_APP_API_URL=https://your-domain/api
set -Eeuo pipefail

# Everything is inside main() so bash reads the whole file before running it:
# `git checkout` below replaces this very file while it is executing.
main() {
  commit_sha="${1:?Usage: bash scripts/deploy.sh <commit-sha>}"
  app_name="${PM2_APP_NAME:-edunextg-sales-api}"

  cd "${APP_DIR:-$(dirname "$0")/..}"

  log() { printf '\n==> %s\n' "$*"; }
  # Returns non-zero, so after the rollback trap is set it also triggers a rollback.
  fail() { printf '\nDEPLOY FAILED: %s\n' "$*" >&2; return 1; }

  # ---- Pre-flight checks (nothing has changed yet) ------------------------------
  command -v pm2 >/dev/null 2>&1 || fail "PM2 is required (npm install -g pm2)."
  command -v curl >/dev/null 2>&1 || fail "curl is required (apt install curl)."
  [ -f backend/.env ] || fail "backend/.env is missing on the server."
  [ -f frontend/.env.production.local ] \
    || fail "frontend/.env.production.local is missing. Add REACT_APP_API_URL=https://your-domain/api"
  grep -q '^REACT_APP_API_URL=' frontend/.env.production.local \
    || fail "REACT_APP_API_URL is not set in frontend/.env.production.local"
  [ -z "$(git status --porcelain --untracked-files=no)" ] \
    || fail "The server checkout has local changes. Push them to GitHub, or discard them with: git checkout -- ."

  port="$(grep -E '^PORT=' backend/.env | tail -n1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
  [ -n "$port" ] || fail "PORT is not set in backend/.env"

  previous_sha="$(git rev-parse HEAD)"
  swapped_frontend=false

  # If anything below fails, put the previous version back and restart it.
  rollback() {
    local status=$?
    # A failing ( ... ) step also fires the trap inside it; let the main script handle it.
    if [ "${BASH_SUBSHELL:-0}" -gt 0 ]; then exit "$status"; fi
    trap - ERR
    printf '\n!! Deploy of %s failed. Rolling back to %s\n' "$commit_sha" "$previous_sha" >&2
    git checkout --quiet --detach "$previous_sha" || true
    (cd backend && npm ci --omit=dev --no-audit --no-fund) || true
    if [ "$swapped_frontend" = true ] && [ -d frontend/build_prev ]; then
      rm -rf frontend/build_failed
      mv frontend/build frontend/build_failed || true
      mv frontend/build_prev frontend/build || true
    fi
    rm -rf frontend/build_next
    pm2 restart "$app_name" --update-env || true
    exit "$status"
  }
  trap rollback ERR

  # ---- Get the code -------------------------------------------------------------
  log "Fetching $commit_sha (currently on $previous_sha)"
  git fetch --prune origin master
  git checkout --quiet --detach "$commit_sha"

  # ---- Backend dependencies -----------------------------------------------------
  log "Installing backend dependencies"
  (cd backend && npm ci --omit=dev --no-audit --no-fund)

  # ---- Frontend build -----------------------------------------------------------
  # Build into build_next so the live site keeps serving the old build until the
  # new one is complete, then swap the folders in one step.
  log "Building frontend"
  rm -rf frontend/build_next
  (
    cd frontend
    npm ci --no-audit --no-fund
    CI=false BUILD_PATH=build_next NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build
  )
  [ -f frontend/build_next/index.html ] || fail "Frontend build did not produce index.html"

  rm -rf frontend/build_prev
  if [ -d frontend/build ]; then mv frontend/build frontend/build_prev; fi
  mv frontend/build_next frontend/build
  swapped_frontend=true

  # ---- Restart backend ----------------------------------------------------------
  log "Restarting backend ($app_name)"
  if pm2 describe "$app_name" >/dev/null 2>&1; then
    pm2 restart "$app_name" --update-env
  else
    (cd backend && pm2 start npm --name "$app_name" -- start)
  fi
  pm2 save

  # ---- Health check -------------------------------------------------------------
  # The backend runs its schema checks before it starts listening, so allow ~60s.
  log "Waiting for http://127.0.0.1:$port/ to respond"
  healthy=false
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
      healthy=true
      break
    fi
    sleep 2
  done
  if [ "$healthy" != true ]; then
    pm2 logs "$app_name" --lines 40 --nostream || true
    fail "Backend did not respond on port $port after restart."
  fi

  trap - ERR
  rm -rf frontend/build_failed
  log "Deployed $commit_sha"
}

main "$@"
exit $?

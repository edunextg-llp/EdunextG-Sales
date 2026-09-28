#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:?Usage: ./scripts/deploy.sh <commit-sha>}"

git fetch --prune origin master
git checkout --detach "$commit_sha"

(
  cd backend
  npm ci --omit=dev
)

(
  cd frontend
  npm ci
  npm run build
)

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe edunextg-sales-api >/dev/null 2>&1; then
    pm2 restart edunextg-sales-api --update-env
  else
    (
      cd backend
      pm2 start npm --name edunextg-sales-api -- start
    )
    pm2 save
  fi
else
  echo "PM2 is required to run the backend." >&2
  exit 1
fi

echo "Deployed $commit_sha"

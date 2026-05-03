#!/usr/bin/env bash
# Deploy backend and frontend to two Heroku apps (from repo root).
# Prerequisites: Heroku CLI, git, logged in (`heroku login`), billing for Postgres/Redis add-ons.
set -euo pipefail

HEROKU="${HEROKU:-heroku}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! "$HEROKU" auth:whoami >/dev/null 2>&1; then
  echo "Run: heroku login"
  exit 1
fi

# Override with BACKEND_APP / FRONTEND_APP if you want fixed names (must be globally unique on Heroku).
BACKEND_APP="${BACKEND_APP:-caimera-assessment-api-$RANDOM}"
FRONTEND_APP="${FRONTEND_APP:-caimera-assessment-web-$RANDOM}"
echo "Heroku app names: API=$BACKEND_APP  Web=$FRONTEND_APP"

if ! "$HEROKU" apps:info -a "$BACKEND_APP" >/dev/null 2>&1; then
  "$HEROKU" create "$BACKEND_APP" --region us
else
  echo "Backend app $BACKEND_APP already exists."
fi

if ! "$HEROKU" apps:info -a "$FRONTEND_APP" >/dev/null 2>&1; then
  "$HEROKU" create "$FRONTEND_APP" --region us
else
  echo "Frontend app $FRONTEND_APP already exists."
fi

git remote remove heroku-backend 2>/dev/null || true
git remote remove heroku-frontend 2>/dev/null || true
"$HEROKU" git:remote -a "$BACKEND_APP" -r heroku-backend
"$HEROKU" git:remote -a "$FRONTEND_APP" -r heroku-frontend

echo "Adding Postgres and Redis to $BACKEND_APP (requires verified Heroku billing)..."
set +e
"$HEROKU" addons:create heroku-postgresql -a "$BACKEND_APP"
PG_EXIT=$?
"$HEROKU" addons:create heroku-redis -a "$BACKEND_APP"
RD_EXIT=$?
set -e
if [[ "$PG_EXIT" -ne 0 ]]; then
  echo "Postgres add-on failed. Add manually: heroku addons:create heroku-postgresql -a $BACKEND_APP"
fi
if [[ "$RD_EXIT" -ne 0 ]]; then
  echo "Redis add-on failed. Add manually: heroku addons:create heroku-redis -a $BACKEND_APP"
fi

echo "Pushing API..."
git subtree push --prefix backend heroku-backend main

BACKEND_URL="https://${BACKEND_APP}.herokuapp.com"
FRONTEND_URL="https://${FRONTEND_APP}.herokuapp.com"

"$HEROKU" config:set CLIENT_ORIGIN="$FRONTEND_URL" -a "$BACKEND_APP"

"$HEROKU" config:set \
  VITE_BACKEND_URL="$BACKEND_URL" \
  NPM_CONFIG_PRODUCTION=false \
  -a "$FRONTEND_APP"

echo "Pushing frontend (build uses VITE_BACKEND_URL)..."
git subtree push --prefix frontend heroku-frontend main

echo ""
echo "Done."
echo "  API:       $BACKEND_URL"
echo "  Frontend:  $FRONTEND_URL"
echo "Open the frontend URL in your browser."

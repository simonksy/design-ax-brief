#!/usr/bin/env bash
# Deploy the Design AX Brief to production.
#
# WHY THIS EXISTS: Cloudflare Workers Builds deploys the site from the
# `cloudflare/workers-autoconfig` branch (that branch holds wrangler.jsonc, added
# by the cloudflare-workers-and-pages[bot]), NOT from `main`. Pushing content to
# `main` alone does NOT trigger a deploy — the live site stays frozen at whatever
# the deploy branch last pointed to. This script fast-forwards the deploy branch to
# main's content (via merge) and pushes it, which triggers the Cloudflare build.
#
# Usage (run AFTER main is committed + pushed):
#   bash pipeline/deploy.sh
#
# Safe + idempotent: if the deploy branch is already up to date with main it just
# reports "already in sync". wrangler.jsonc lives only on the deploy branch and does
# not conflict with content changes, so the merge is always clean.
set -euo pipefail

DEPLOY_BRANCH="cloudflare/workers-autoconfig"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch origin --quiet

# main must be fully pushed first, or the deploy branch would ship stale content.
if [ -n "$(git rev-list origin/main..main 2>/dev/null || true)" ]; then
  echo "ERROR: main has unpushed commits. Run 'git push origin main' first, then re-run." >&2
  exit 1
fi

start_branch="$(git rev-parse --abbrev-ref HEAD)"
cleanup() { git checkout "$start_branch" --quiet 2>/dev/null || true; }
trap cleanup EXIT

git checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH" --quiet

if [ -z "$(git rev-list "$DEPLOY_BRANCH"..main 2>/dev/null || true)" ]; then
  echo "Deploy branch '$DEPLOY_BRANCH' already in sync with main — nothing to deploy."
  exit 0
fi

git merge --no-edit main
if [ ! -f wrangler.jsonc ]; then
  echo "ERROR: wrangler.jsonc missing after merge — aborting to avoid breaking the deploy config." >&2
  git merge --abort 2>/dev/null || true
  exit 1
fi

git push origin "$DEPLOY_BRANCH"
echo "OK: '$DEPLOY_BRANCH' synced with main and pushed → Cloudflare Workers build triggered."
echo "Verify in ~30-120s: curl -s https://axitdesign.simonksy.workers.dev/axbrief-data.js | grep -c <today-card-id>"

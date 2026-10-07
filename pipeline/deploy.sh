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

# The deploy always ships origin/main, never the LOCAL main ref. In a worktree the
# local main is usually stale (another worktree has it checked out and commits go to
# a feature branch pushed with `git push origin HEAD:main`), and comparing against it
# made this script report "already in sync" while real commits sat undeployed.
if [ -n "$(git rev-list origin/main..HEAD 2>/dev/null || true)" ]; then
  echo "ERROR: the current branch has commits that are not on origin/main." >&2
  echo "       Run 'git push origin HEAD:main' first, then re-run." >&2
  exit 1
fi

# 아래 직접 배포(wrangler deploy)는 커밋이 아니라 '작업트리'를 올린다. 그래서 커밋을
# 빠뜨린 파일도 프로덕션에 올라가 멀쩡해 보이고, 다음 CI 빌드가 커밋된 상태로 다시
# 빌드하는 순간 조용히 사라진다 — 마케팅 섹션이 실제로 이렇게 하루 만에 증발했다.
# 추적 대상 파일이 더럽거나, 배포에 들어갈 새 파일이 커밋되지 않았으면 멈춘다.
DIRTY="$(git status --porcelain -- . ':!*.log' | grep -v '^?? \.superpowers/' || true)"
if [ -n "$DIRTY" ]; then
  echo "ERROR: 작업트리가 깨끗하지 않다. 직접 배포는 작업트리를 올리므로, 지금 배포하면" >&2
  echo "       커밋되지 않은 내용이 프로덕션에 올라갔다가 다음 CI 빌드에서 사라진다." >&2
  echo "       커밋하거나 되돌린 뒤 다시 실행하라:" >&2
  echo "$DIRTY" | sed 's/^/         /' >&2
  exit 1
fi

start_branch="$(git rev-parse --abbrev-ref HEAD)"
cleanup() { git checkout "$start_branch" --quiet 2>/dev/null || true; }
trap cleanup EXIT

git checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH" --quiet

if [ -z "$(git rev-list "$DEPLOY_BRANCH"..origin/main 2>/dev/null || true)" ]; then
  echo "Deploy branch '$DEPLOY_BRANCH' already in sync with origin/main — nothing to deploy."
  exit 0
fi

git merge --no-edit origin/main
if [ ! -f wrangler.jsonc ]; then
  echo "ERROR: wrangler.jsonc missing after merge — aborting to avoid breaking the deploy config." >&2
  git merge --abort 2>/dev/null || true
  exit 1
fi

git push origin "$DEPLOY_BRANCH"
echo "OK: '$DEPLOY_BRANCH' synced with origin/main and pushed → Cloudflare Workers build triggered."

# Direct deploy as well — the Workers Builds CI project was created against the
# old worker name (axitdesign); after the rename to axitnow the CI outcome is
# not guaranteed, so ship directly too (idempotent; same assets+worker).
# wrangler 4.114 needs Node >=22 → prefer homebrew node.
export PATH="/opt/homebrew/bin:$PATH"
unset NODE_OPTIONS   # a stale session-injected preload can break node; wrangler needs a clean env
if npx wrangler deploy >/tmp/axbrief-wrangler-deploy.log 2>&1; then
  echo "OK: direct wrangler deploy → axitnow updated ($(date '+%H:%M:%S'))"
else
  echo "WARN: direct wrangler deploy failed (see /tmp/axbrief-wrangler-deploy.log) — relying on CI build" >&2
fi
echo "Verify in ~30-120s: curl -s https://axitnow.com/axbrief-data.js | grep -c <today-card-id>"

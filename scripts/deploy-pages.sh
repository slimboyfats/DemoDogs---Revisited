#!/usr/bin/env bash
# Build the client and publish it to the gh-pages branch (GitHub Pages serves it from there).
# No GitHub Actions: run this by hand when you want the live game updated.
#   pnpm deploy:pages                       # base /DemoDogs---Revisited/
#   DEMODOGS_BASE=/ pnpm deploy:pages       # a custom domain or user site
set -euo pipefail
cd "$(dirname "$0")/.."

export DEMODOGS_BASE="${DEMODOGS_BASE:-/DemoDogs---Revisited/}"
remote="${DEPLOY_REMOTE:-origin}"
sha="$(git rev-parse --short HEAD)"
url="$(git remote get-url "$remote")"

pnpm build

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R packages/client/dist/. "$tmp/"
touch "$tmp/.nojekyll"

cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-deploy}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy@localhost}" commit -qm "Deploy ${sha}"
git push -f "$url" gh-pages
echo "Deployed ${sha} to gh-pages with base ${DEMODOGS_BASE}"

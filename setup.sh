#!/bin/bash
# One-shot setup: GitHub repo + push + Vercel production deploy.
# Run:  bash ~/Downloads/universe-orb/setup.sh
set -e
cd "$(dirname "$0")"
echo "── Universe Orb setup ──"

command -v git >/dev/null || { echo "git is required (install Xcode command line tools: xcode-select --install)"; exit 1; }
command -v node >/dev/null || { echo "node is required (https://nodejs.org, or: brew install node)"; exit 1; }

# gh CLI
if ! command -v gh >/dev/null; then
  if command -v brew >/dev/null; then echo "Installing GitHub CLI…"; brew install gh; else
    echo "GitHub CLI not found and Homebrew missing. Install from https://cli.github.com then re-run."; exit 1; fi
fi

# auth (opens browser; approve there)
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https -h github.com

# repo
if [ ! -d .git ]; then git init -q && git add -A && git commit -qm "Universe Orb: initial build"; fi
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create universe-orb --public --source . --remote origin --push
else
  git push -u origin HEAD
fi
echo "✓ pushed to GitHub: $(gh repo view --json url -q .url)"

# vercel deploy (opens browser to confirm login)
npx -y vercel@latest login
npx -y vercel@latest link --yes --project universe-orb
npx -y vercel@latest deploy --prod --yes
echo
echo "── Done. Two things left, both in the Vercel dashboard (vercel.com → universe-orb → Settings): ──"
echo "  1. Environment Variables → add ROBOFLOW_API_KEY (server-side) → redeploy. Powers the live dataset drawer."
echo "  2. Git → Connect the GitHub repo universe-orb, so the nightly index refresh auto-deploys."

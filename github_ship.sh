#!/bin/bash
# Automatically change directory to the script's folder so it runs correctly from anywhere
cd "$(dirname "$0")"

# Exit on error
set -e

echo "🖥 FloatPad — Clean GitHub Shipper"
echo "────────────────────────────────────────"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "❌ Error: GitHub CLI ('gh') is not installed."
  echo "Please install it using Homebrew first: brew install gh"
  exit 1
fi

echo "📦 Step 1: Initializing Git Repository..."
if [ ! -d .git ]; then
  git init
fi

# Set default branch to main
git checkout -b main 2>/dev/null || git branch -M main

echo "🔒 Step 2: Committing codebase..."
git add .
git commit -m "Initial commit: FloatPad — Premium overlay utility board, video, web, write" || echo "Already committed!"

echo ""
echo "🚀 Step 3: Creating GitHub Repository and Pushing..."
gh repo create floatpad --public --source=. --remote=origin --push

echo ""
echo "✅ Successfully shipped to GitHub!"
echo "Your repository is now live at: https://github.com/$(gh api user -q .login)/floatpad"

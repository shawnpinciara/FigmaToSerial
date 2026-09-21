#!/bin/sh
# Commit all changes and push to origin/main
set -e
cd "$(dirname "$0")"
git add .
git commit -m "Docs: clarify Figma Open link setup (a/b/any string) with screenshots; add src assets" || echo "nothing to commit"
git push

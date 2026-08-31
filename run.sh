#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f ./dist/index.js ]]; then
  echo "dist not found, building..."
  pnpm build
fi

exec node ./dist/index.js "$@"

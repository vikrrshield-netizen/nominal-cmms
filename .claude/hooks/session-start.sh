#!/bin/bash
# SessionStart hook pro Claude Code na webu.
# Připraví repo tak, aby šel rovnou build, lint i (volitelně) smoke testy.
set -euo pipefail

# Spouštět jen v remote prostředí (Claude Code na webu), lokálně nic neděláme.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# JS závislosti — idempotentní a přátelské k cachování containeru.
npm install

# Playwright Chromium pro smoke testy (best-effort, nesmí shodit hook).
# Smoke testy stejně potřebují SMOKE_BASE_URL + přihlašovací PINy.
npx playwright install chromium > /dev/null 2>&1 || true

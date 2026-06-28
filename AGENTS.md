# AGENTS.md

Pokyny pro AI agenty (OpenAI Codex a další nástroje) jsou v tomto repu
**společné s Claude Code** — držíme jeden zdroj pravdy.

➡️ **Přečti `CLAUDE.md` v kořeni repa a řiď se jím.** Najdeš tam:
- stack a architekturu (React 19 + TS + Vite + Tailwind v4 + Firebase),
- konvence: **UI texty česky, identifikátory v kódu anglicky**, béžovo-zelený
  theme (třídy `vik-*`), motion utility,
- přehled projektových skillů a pravidla **„šetři limity"** (CI místo ručního
  buildu, model tiering, cílené čtení kódu).

Doménový kontext (továrna, role, work ordery, glosář) je v `docs/` (Obsidian vault).

## Ověření změn
- `npm run lint` + `npm run build` (build = `tsc -b && vite build`).
- CI to dělá automaticky na PR/push (`.github/workflows/ci.yml`) — nech ověřování
  na CI, nebuildi opakovaně ručně.

## Komunikace
S uživatelem komunikuj **česky**.

## Codex — slash „prompts"
Obecné postupy (`/ship`, `/audit`, `/fix-ci`, `/deploy`) jsou v
`.claude/starter-kit/commands/`. Pro Codex je zkopíruj do `~/.codex/prompts/`
(stejný markdown formát) — pak je máš jako příkazy i v Codexu.

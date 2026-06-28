# Claude Code starter kit (přenosný)

Obecné, **projektově nezávislé** kousky systému na úsporu Claude limitů.
Zkopíruj do nového repa a doplň konvence daného projektu.

> Pozn.: Tahle složka je jen úložiště — Claude Code načítá skilly z
> `.claude/commands/`, ne odsud. Nic se odsud automaticky nespustí.

## Jak nasadit do nového repa

1. **Skilly** → zkopíruj `commands/*.md` do `.claude/commands/` cílového repa.
   - `ship.md`, `audit.md`, `fix-ci.md` jsou obecné, fungují rovnou.
   - `deploy.md` má placeholder `<DEPLOY_COMMAND>` / `<URL>` — uprav podle projektu.
2. **CI** → zkopíruj `workflows/ci.yml` do `.github/workflows/ci.yml`.
   - Uprav kroky podle `package.json` (lint / typecheck / build / test).
3. **CLAUDE.md** → vlož obsah `CLAUDE.snippet.md` do `CLAUDE.md` cílového repa
   (sekce „Šetři limity" + přehled skillů). Doménovou část napiš zvlášť.
4. **Allowlist** (volitelně) → do `.claude/settings.json` přidej blok
   `permissions.allow` z `settings.allow.json`.

## Co je projektově specifické (NEKopíruj naslepo)
Skilly typu `/page`, `/service`, `/skeleton`, `/wire-setting` kódují konvence
konkrétního projektu (stack, vzory, theme) — pro nový projekt si napiš vlastní.

## Jiné nástroje a chaty
- **OpenAI Codex** (a další agenti): čtou `AGENTS.md` v kořeni repa (společný
  zdroj pravdy, ukazuje na `CLAUDE.md`). Obecné skilly z `commands/` jdou
  zkopírovat do `~/.codex/prompts/` (stejný markdown). Kickoff prompt pro
  Codex session je v `codex-kickoff.md`.
- **Klasické chaty na claude.ai**: `.md` skilly nevidí — principy a styl vlož
  do **Project → Custom instructions** (hotový text v `claude-project-instructions.md`),
  doménu nahraj do **Project knowledge**.

## Princip „šetři limity"
- **Stroj > agent**: ověřování (lint/typecheck/build) nech na CI a hocích.
- **Skill > přemýšlení**: opakovaný postup zabal do `.md`, ať se nevymýšlí znovu.
- **Levný model > drahý** na mechanickou práci; drahý jen na těžké přemýšlení.
- **Míň čtení kódu**: cílené rozsahy, kontext v CLAUDE.md/docs.

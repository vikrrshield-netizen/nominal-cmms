# Znalostní báze — Nominal CMMS

Tahle složka je **znalostní vault** projektu: čistě markdown, verzovaný v gitu.
Slouží dvěma způsobům najednou:

- 🧠 **Pro Claude Code** — soubory tady jsou trvalý kontext o doméně. Méně
  vysvětlování v každé session, méně tokenů, konzistentnější výstupy.
- 📓 **Jako Obsidian vault** — otevři složku `docs/` v Obsidianu (Open folder as
  vault) a procházej poznámky, odkazy `[[...]]` a graf. Edituješ je jako kdekoli
  jinde; commitne se to do repa.

> Vztah ke `CLAUDE.md`: `CLAUDE.md` v rootu je **stručná operační příručka** (jak
> stavět, lintovat, konvence). Tenhle vault je **doménová encyklopedie** (co
> systém modeluje a proč). `CLAUDE.md` má zůstat krátký; detaily patří sem.

## Obsah

- [[domena]] — work ordery, stavy, priority, datový tok
- [[tovarna]] — budovy A–E, zóny (gluten / bezlepek), místnosti
- [[role]] — uživatelské role a oprávnění
- [[glosar]] — pojmy a zkratky

## Jak to udržovat

- Píš česky, stručně, v odrážkách. Jeden soubor = jedno téma.
- Když přidáš/změníš doménový koncept v kódu, aktualizuj odpovídající poznámku.
- Odkazuj mezi poznámkami přes `[[nazev-souboru]]` (bez přípony `.md`).
- Fakta drž v souladu s kódem — zdroj pravdy je `src/types/` a `src/data/`.

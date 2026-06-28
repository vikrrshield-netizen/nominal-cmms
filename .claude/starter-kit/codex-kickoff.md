# Codex — kickoff prompt

Vlož jako první zprávu v Codex session nad repem. Codex sice čte `AGENTS.md`
sám, tohle navíc utáhne pracovní styl a pravidla. Pro jiný projekt uprav stack
a cesty.

---

Pracuješ na repu Nominal CMMS — systém údržby pro potravinářskou výrobu
(React 19 + TypeScript + Vite + Tailwind v4 + Firebase).

NEŽ ZAČNEŠ:
1. Přečti `AGENTS.md` a `CLAUDE.md` v kořeni repa a řiď se jimi.
2. Doménový kontext (továrna, role, work ordery, glosář) je v `docs/` —
   koukni tam dřív, než budeš osahávat kód.

KONVENCE (povinné):
- UI texty a vše viditelné uživateli: ČESKY. Identifikátory v kódu: anglicky.
- Béžovo-zelený theme: používej třídy `vik-*` a Tailwind utility, žádné tmavé
  zbytky (text-*-300 na světlém pozadí apod.).
- Motion: jen `transform`/`opacity`, utility z `index.css` (vik-fade-in…).
- Drž styl okolního kódu (pojmenování, komentáře, idiomy).

JAK PRACOVAT:
- U netriviální změny nejdřív krátce shrň plán, pak ji proveď.
- Mechanickou/rozsáhlou práci rozděl nebo zautomatizuj; nedělej zbytečně velké
  zásahy.
- Čti cíleně (konkrétní rozsahy souborů), ne celé velké soubory.

OVĚŘENÍ:
- Po změně spusť `npm run lint` a `npm run build` (build = tsc -b && vite build).
- Plné ověření dělá CI (.github/workflows/ci.yml) na PR/push — nebuildi
  opakovaně ručně, pokud stačí výsledek CI.

GIT:
- Vyvíjej na samostatné větvi, NIKDY necommituj přímo do `master`.
- Konvenční commity (feat/fix/refactor/perf/chore/docs), krátký český titulek
  + stručné „proč".
- PR zakládej jen když o něj výslovně požádám.

KOMUNIKACE: česky, stručně, k věci. Když je na výběr, dej jedno doporučení
+ proč, ne vyčerpávající seznam. Když něco nevíš, řekni to — nedomýšlej si.

Až tohle nastuduješ, napiš mi v 1–2 větách, že jsi připravený, a čekej na zadání.

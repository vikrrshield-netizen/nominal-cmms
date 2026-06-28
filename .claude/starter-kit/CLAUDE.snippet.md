<!-- Vlož do CLAUDE.md cílového repa. Obecná část — doménu napiš zvlášť. -->

### Projektové skilly (`.claude/commands/`)

Opakované postupy jsou zabalené do slash commandů — používej je místo
vymýšlení od nuly: `/ship` (commit+push), `/deploy`, `/fix-ci`, `/audit`.
(Doplň projektově specifické: generátory stránek/komponent/služeb apod.)

### Šetři Claude limity

- **Ověřování nech na CI.** GitHub Actions (`.github/workflows/ci.yml`) pouští
  lint + typecheck + build na každý PR/push. Nespouštěj build opakovaně ručně,
  pokud stačí kouknout na výsledek CI; lokálně buildi jen pro rychlou zpětnou
  vazbu k rozdělané změně.
- **Model tiering.** Mechanickou práci (kostry, přejmenování, hromadné drobné
  edity, vyhledávání) deleguj na levnější model nebo na subagenty; nejdražší
  model si šetři na těžké přemýšlení (architektura, záludné bugy, review).
  Velké mechanické dávky paralelizuj přes subagenty, ať nezahltí hlavní kontext.
- **Míň osahávání kódu.** Než budeš číst kód, koukni do dokumentace a tohoto
  souboru; čti cíleně (konkrétní rozsahy), ne celé velké soubory.

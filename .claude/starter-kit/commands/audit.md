---
description: Bezpečný průchod npm audit — triage a oprava bez breaking změn
---

Projdi a sniž bezpečnostní dluh v závislostech, **bez rozbití buildu**.

1. `npm audit` — vypiš počty podle závažnosti a konkrétní balíčky (přímé vs.
   tranzitivní; runtime vs. jen dev/build/server).
2. Bezpečné opravy: `npm audit fix` (BEZ `--force`). `--force` (major/downgrade)
   **nikdy** automaticky — jen navrhni a vyžádej souhlas.
3. Po opravě ověř: build + lint. Když praskne, vrať `package-lock.json`/`package.json`
   (`git checkout`).
4. Zbývající zranitelnosti opravitelné jen breaking změnou vysvětli stručně
   s doporučením (upgradovat / počkat / přijmout riziko), ať se uživatel rozhodne.
   Zdůrazni, jestli jsou v runtime, nebo jen v dev/serverových nástrojích.
5. Commit `chore(deps): bezpečný npm audit fix` jen pokud build prošel.

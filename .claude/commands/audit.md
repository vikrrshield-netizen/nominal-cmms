---
description: Bezpečný průchod npm audit — triage a oprava bez breaking změn
---

Projdi a sniž bezpečnostní dluh v závislostech, **bez rozbití buildu**.

1. `npm audit --omit=dev` i `npm audit` — vypiš počty podle závažnosti a vypiš konkrétní balíčky (přímé vs. tranzitivní).
2. Zkus **bezpečné** opravy: `npm audit fix` (BEZ `--force`). `--force` (major bumpy) **nikdy** automaticky — jen navrhni a vyžádej souhlas.
3. Po opravě ověř, že nic neprasklo: `npm run build` + `npm run lint`. Když build spadne, vrať `package-lock.json`/`package.json` zpět (`git checkout`).
4. Vysvětli zbývající zranitelnosti, které jdou opravit jen breaking změnou — stručně, s doporučením (upgradovat / počkat / přijmout riziko), ať se uživatel rozhodne.
5. Změny commitni jako `chore(deps): bezpečný npm audit fix` jen pokud build prošel.

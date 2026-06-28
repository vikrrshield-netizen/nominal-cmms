---
description: Build + nasazení + vrácení URL (uprav DEPLOY_COMMAND/URL dle projektu)
---

Nasaď aktuální stav na hosting.

1. Ověř čistý build (např. `npm run build`). Když selže, **nenasazuj** — nahlas chybu.
2. Spusť deploy příkaz projektu: `<DEPLOY_COMMAND>` (např. `firebase deploy --only hosting`,
   `vercel --prod`, `netlify deploy --prod`…).
3. Po úspěchu vrať živou URL: `<URL>`.
4. Deploy je veřejná akce — pokud k tomu uživatel výslovně nevyzval v této zprávě,
   **nejdřív se zeptej**. V izolovaném prostředí bez přihlášení/sítě deploy nepůjde —
   pak to oznam a navrhni, ať příkaz spustí uživatel lokálně.

Volitelný argument: **$ARGUMENTS**

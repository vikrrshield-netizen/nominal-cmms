---
description: Build + nasazení na Firebase hosting + vrácení URL
---

Nasaď aktuální stav na produkční hosting.

1. Ověř čistý build: `npm run build`. Když selže, **nenasazuj** — nahlas chybu.
2. Spusť `firebase deploy --only hosting` (nebo `npx firebase deploy --only hosting`, pokud CLI není globálně). Pozn.: v izolovaném prostředí bez přihlášení/sítě to nepůjde — pak to oznam a navrhni, ať příkaz spustí uživatel lokálně.
3. Po úspěchu vrať živou URL: **https://nominal-cmms.web.app** (a `/landing.html` pro prodejní stránku).
4. Deploy je veřejná akce — pokud k tomu uživatel výslovně nevyzval v této zprávě, **nejdřív se zeptej**.

Volitelný argument: **$ARGUMENTS**

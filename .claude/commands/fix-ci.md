---
description: Stáhne logy padlé CI (GitHub Actions) a opraví příčinu
---

Najdi a oprav padlou CI na aktuální větvi / PR.

1. Přes GitHub MCP nástroje (`mcp__github__*`, načti přes ToolSearch) zjisti stav: poslední běh workflow / check runs pro head commit větve.
2. U padlého jobu stáhni logy (`get_job_logs`, případně failed-only) a najdi **kořenovou příčinu** (lint chyba, typová chyba, selhaný build, padlý test). Necituj celé logy — vytáhni jen relevantní řádky.
3. Oprav příčinu v kódu. Reprodukuj lokálně tím samým příkazem (`npm run lint` / `npm run build`), ať víš, že je zeleno.
4. Commitni (`fix(ci): …`) a pushni na větev. Lint/build dělá po pushi zase CI — nečekej `sleep`, reaguj na výsledek.
5. Pokud je příčina mimo rozsah (flaky test, infra), nahlas diagnózu a kde jsi zaseknutý, místo opakovaného kopání.

Volitelný argument (číslo PR / název běhu): **$ARGUMENTS**

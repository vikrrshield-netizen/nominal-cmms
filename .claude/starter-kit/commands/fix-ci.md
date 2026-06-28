---
description: Stáhne logy padlé CI (GitHub Actions) a opraví příčinu
---

Najdi a oprav padlou CI na aktuální větvi / PR.

1. Přes GitHub MCP nástroje (`mcp__github__*`) zjisti stav: poslední běh
   workflow / check runs pro head commit větve.
2. U padlého jobu stáhni logy a najdi **kořenovou příčinu** (lint/typová/build/test).
   Necituj celé logy — jen relevantní řádky.
3. Oprav v kódu a reprodukuj lokálně tím samým příkazem, ať víš, že je zeleno.
4. Commit (`fix(ci): …`) a push. Ověření po pushi dělá zase CI — nečekej `sleep`,
   reaguj na výsledek.
5. Když je příčina mimo rozsah (flaky test, infra), nahlas diagnózu a kde jsi
   zaseknutý, místo opakovaného kopání.

Volitelný argument (číslo PR / název běhu): **$ARGUMENTS**

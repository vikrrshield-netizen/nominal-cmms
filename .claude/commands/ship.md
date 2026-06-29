---
description: Staged změny → konvenční commit → push na aktuální větev (jedním krokem)
---

Zabal aktuální rozpracované změny a pošli je na větev. Postup:

1. Spusť `git status --short` a `git diff --stat`. Pokud nic ke commitu, oznam a skonči.
2. Zjisti aktuální větev (`git rev-parse --abbrev-ref HEAD`). **Nikdy necommituj přímo do `master`** — pokud na ní jsi, založ/přepni na vývojovou větev (zeptej se na název, nebo použij `claude/<krátký-popis>`).
3. `git add -A` (nebo jen relevantní soubory, pokud jsou v práci nesouvisející změny — pak se zeptej).
4. Vytvoř **konvenční commit** (`feat:`, `fix:`, `refactor:`, `perf:`, `chore:`, `docs:`) — krátký český titulek + stručné tělo *proč*, ne *co*. Připoj patičku Co-Authored-By / Claude-Session dle pravidel prostředí.
5. `git push -u origin <větev>`; při síťové chybě retry s exponenciálním backoffem (2/4/8/16 s).
6. Vrať jednu shrnující větu (větev + hash + titulek). **PR nezakládej**, pokud o něj uživatel výslovně nepožádá.

Volitelný argument upřesňuje rozsah/zprávu: **$ARGUMENTS**

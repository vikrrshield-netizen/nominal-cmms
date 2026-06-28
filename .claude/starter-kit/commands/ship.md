---
description: Staged změny → konvenční commit → push na aktuální větev (jedním krokem)
---

Zabal aktuální rozpracované změny a pošli je na větev. Postup:

1. `git status --short` a `git diff --stat`. Pokud nic ke commitu, oznam a skonči.
2. Zjisti větev (`git rev-parse --abbrev-ref HEAD`). **Necommituj přímo do hlavní
   větve** — pokud na ní jsi, založ/přepni na vývojovou větev.
3. `git add -A` (nebo jen relevantní soubory; u nesouvisejících změn se zeptej).
4. **Konvenční commit** (`feat:`, `fix:`, `refactor:`, `perf:`, `chore:`, `docs:`)
   — krátký titulek + stručné tělo *proč*, ne *co*. Připoj patičku dle pravidel
   prostředí (Co-Authored-By apod.).
5. `git push -u origin <větev>`; při síťové chybě retry s backoffem (2/4/8/16 s).
6. Vrať jednu shrnující větu (větev + hash + titulek). **PR nezakládej** bez výslovné žádosti.

Volitelný argument upřesňuje rozsah/zprávu: **$ARGUMENTS**

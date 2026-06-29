---
description: Revize aktuálního diffu proti konvencím projektu (CZ UI, role, motion, theme)
---

Proveď revizi aktuálních změn (`git diff` proti `master`, případně staged) se zaměřením na konvence **tohoto** projektu. Nejde o obecný code review — hledej hlavně tohle:

1. **Jazyk:** všechny UI texty, labely a hlášky česky; identifikátory (proměnné, funkce, typy) anglicky.
2. **Styling:** béžový/světlý theme — používají se sdílené třídy (`.vik-card`, `.vik-button`, `.vik-input`, `.vik-chip`, `.btn-b`) nebo Tailwind utility? Žádné natvrdo zadané dark-theme barvy.
3. **Motion:** animuje se jen `transform` + `opacity`? Použity utility `vik-*` a timing proměnné `--dur-*`? Respektován `prefers-reduced-motion` (tj. nic mimo globální guard)?
4. **Data flow:** zápisy přes service vrstvu, čtení přes `onSnapshot`; ne přímé volání Firestore roztroušené po komponentách bez důvodu.
5. **Role/oprávnění:** kde se to hodí, je akce chráněná přes `hasPermission(role, …)` z `types/user.ts`? Kiosk (OPERATOR) zůstává uzamčený?
6. **Kvalita:** žádné `.bak` soubory, žádné zapomenuté `console.log`, dead code, `any` bez důvodu.

Vypiš nálezy seřazené podle závažnosti (blokující → drobnost), u každého konkrétní soubor:řádek a návrh opravy. Nakonec krátké shrnutí, zda je diff připravený k mergi.

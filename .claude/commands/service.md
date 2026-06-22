---
description: Vygeneruje Firestore service modul podle konvencí projektu
---

Vytvoř nový Firestore service pro doménu: **$ARGUMENTS**

Drž se vzoru existujících services v `src/services/` (např. `taskService.ts`):
1. Hlavička komentářem `// src/services/<name>Service.ts` + krátký popis.
2. Importuj jen potřebné funkce z `firebase/firestore` a `db` z `../lib/firebase`.
3. Konstanta `const COLLECTION = '<jméno kolekce>';`.
4. Typy ber/rozšiřuj z `src/types/firestore.ts` — needefinuj duplicitně, pokud už existují.
5. Exportuj funkce ve stylu projektu:
   - `subscribe…(cb)` přes `onSnapshot` (real-time),
   - `create…(input)` / `update…(id, patch)` / `delete…(id)` přes `addDoc`/`updateDoc`/`deleteDoc`,
   - časové značky přes `serverTimestamp()`.
6. Pokud doména potřebuje lidsky čitelný kód (formát typu `WO-2026-001`), použij `counterService` (`nextCounterValue`, `formatCounter`).
7. Komentáře a UI-facing texty česky, identifikátory anglicky.
8. Na závěr `npm run build` + `npx eslint` na novém souboru a oprav chyby.

Pokud doména není jasná, nejdřív se zeptej na pole/strukturu dokumentu, než začneš psát.

---
description: Přidá skeleton načítací stav do seznamu/stránky podle konvencí projektu
---

Přidej skeleton načítací stav do: **$ARGUMENTS**

Postup:
1. Najdi cílovou stránku/komponentu a její `loading` stav (typicky `const [loading, setLoading] = useState(true)` + `onSnapshot`).
2. Nahraď stávající spinner / „Načítám…" za skeleton z `src/components/ui`:
   - `import { Skeleton, SkeletonList } from '../components/ui';`
   - Pro jednoduchý seznam použij `<SkeletonList rows={6} />`.
   - Pro grid/kartový layout poskládej `<Skeleton width="…" height="…" rounded="…" />` tak, aby placeholder zhruba odpovídal reálné kartě (viz vzor v `src/pages/TasksPage.tsx`).
3. Skutečný seznam po načtení obal jemným `vik-fade-in` (jen pokud tam ještě není).
4. Drž pravidla z `CLAUDE.md`: animovat jen `transform`/`opacity`, UI texty česky.
5. Na závěr spusť `npm run build` a `npx eslint` na změněných souborech a oprav případné chyby.

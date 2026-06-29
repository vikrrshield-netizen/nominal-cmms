---
description: Vytvoří novou route-level stránku podle konvencí projektu
---

Vytvoř novou stránku: **$ARGUMENTS**

Drž se vzoru existujících stránek v `src/pages/` (1 komponenta = 1 route):
1. Soubor `src/pages/<Name>Page.tsx`, default export React komponenty.
2. Layout přes `vik-page` / `vik-page-shell` a sdílené třídy (`.vik-card`, `.vik-button`…); béžový theme, žádné dark barvy.
3. Data: čti přes `onSnapshot` (real-time) s `loading` stavem; zápisy přes odpovídající service v `src/services/`. Pro načítání použij `<SkeletonList>` / `<Skeleton>` z `src/components/ui`.
4. Zaregistruj route v `src/App.tsx` (v rámci `ProtectedRoutes`) a přidej navigaci, pokud se hodí (`BottomNav`/menu).
5. Kde to dává smysl, ochraň přístup přes `hasPermission(role, …)`; OPERATOR má jen kiosk.
6. UI česky, identifikátory anglicky. Jemné přechody přes `vik-fade-in`.
7. Na závěr `npm run build` + `npx eslint` na nových souborech a oprav chyby.

Pokud není jasné, jaká data stránka zobrazuje nebo kdo k ní má přístup, nejdřív se zeptej.

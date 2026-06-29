---
description: Přidá nastavení modulu od typu přes hook a SettingsPage až po napojení do logiky
---

Přidej **funkční** nastavení modulu (per-tenant konfigurace) podle zavedeného vzoru. Cílové nastavení: **$ARGUMENTS**

Drž se přesně tohoto vzoru (už je v repu zaveden):

1. **Typ** — `src/types/tenant.ts`: rozšiř `TenantModuleConfig` o nové pole (vnořené pod klíč modulu, vše volitelné). Např. `fleet?: { serviceIntervalKm?: number }`.
2. **Perzistence** — používá se `useTenantSettings().updateModuleConfig(tenantId, patch, userName, tenantName)`; díky `setDoc(merge:true)` se vnořené mapy hloubkově prolnou (ostatní klíče zůstanou). Nic dalšího v hooku obvykle netřeba.
3. **UI** — `src/pages/SettingsPage.tsx`: v příslušné sekci přidej `NumberSetting` (nebo obdobu) napojený na `cfg.<modul>?.<pole>` a `save({ <modul>: { <pole>: v } })`. Zápis gateuj `canManage` (= `hasPermission('admin.manage')`), odpovídá `firestore.rules`.
4. **Nikdy neukládej `undefined`** (Firestore spadne) — prázdné pole = Save vypnutý.
5. **Napojení do logiky** (důležité — ať to není mrtvá konfigurace): najdi místo, kde se hodnota má projevit, a použij ji (vzor: WarehousePage používá `lowStockThreshold` jako záložní minimum přes `effectiveMin`). Pokud konzument neexistuje, řekni to a navrhni, kam ji napojit.
6. **Ověř**: `npx tsc -b` + `npx eslint <změněné soubory>`. UI texty česky, identifikátory anglicky, barvy z béžovo-zeleného theme.

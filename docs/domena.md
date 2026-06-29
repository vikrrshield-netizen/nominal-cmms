# Doména — úkoly, work ordery, datový tok

Zdroj pravdy: `src/types/firestore.ts`, services v `src/services/`.

## Úkoly / Work ordery

- Lidský kód ve formátu **`WO-2026-001`** (rok + pořadové číslo, generuje
  `counterService`).
- Vznikají z více zdrojů (`TaskSource`) — mj. hlášení z kiosku (operátor),
  plán, revize, nápad.

### Stavy (`TaskStatus`)

```
backlog → planned → in_progress → paused → completed
                                         ↘ cancelled
```

- `backlog` — zaevidováno, nenaplánováno
- `planned` — má `plannedWeek` (např. `2026-W07`) / `plannedDate`
- `in_progress` — někdo pracuje (`startedAt`, přiřazení pracovníci)
- `paused` — přerušeno (`pausedAt`)
- `completed` — hotovo (`completedAt`, `completedByNames`)
- `cancelled` — zrušeno

### Priority (`TaskPriority`)

- **P1** — havárie (okamžitě)
- **P2** — vysoká
- **P3** — běžná
- **P4** — nápad / nice-to-have

## Datový tok

```
Akce uživatele → service funkce → zápis do Firestore
                                       ↓
                          onSnapshot listener → React state → re-render
```

- **Zápisy** jdou přes service vrstvu (`taskService`, `assetService`, …), ne
  přímo z komponent.
- **Čtení** je real-time přes `onSnapshot`.
- Časové značky přes `serverTimestamp()`.
- Offline-first: `enableIndexedDbPersistence` (data drží i bez sítě).

## Související

- [[tovarna]] — každý asset/úkol je vázaný na budovu a místnost
- [[role]] — kdo smí co (vytvářet, editovat, dokončovat)
- [[glosar]] — vysvětlení pojmů

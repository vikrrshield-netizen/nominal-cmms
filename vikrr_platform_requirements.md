# VIKRR Platform Requirements

> Migrační specifikace z Nominal CMMS → VIKRR platforma
> Datum: 2026-02-18
> Zdrojový projekt: nominal-cmms (Firebase)

---

## 1. Požadované Firebase služby

| Služba | Účel | Konfigurace |
|--------|------|-------------|
| **Authentication** | PIN-based přihlášení (4ciferný kód), 6 uživatelských rolí | Email/Password provider, custom email mapping |
| **Cloud Firestore** | Hlavní databáze — 30+ kolekcí, real-time listeners | Offline persistence (IndexedDB), security rules s role-based access |
| **Cloud Storage** | Dokumenty revizí, obrázky strojů, fotky hmyzolapačů | 4 bucket cesty s role-based pravidly |
| **Hosting** | SPA hosting (React + Vite build) | SPA rewrite na `index.html`, cache headers pro static assets |
| **Cloud Functions** | Agregace statistik, budoucí Synology mixer pro trustbox | Node.js 18 runtime |

---

## 2. Authentication — konfigurace

### Metoda přihlášení
- **Email/Password** provider (jediná povolená metoda)
- PIN kód je mapován na email: `pin_XXXX@nominal.local`
- Heslo je odvozeno z PINu: `{pin}00`

### Uživatelské role (6 úrovní)

| Role | Popis | Úroveň přístupu |
|------|-------|------------------|
| `MAJITEL` | Vlastník | Plný přístup (admin) |
| `VEDENI` | Vedení | Management — čtení všeho, zápis většiny |
| `SUPERADMIN` | Superadministrátor | Plný přístup + hard delete + systémové nastavení |
| `UDRZBA` | Údržba | Technik — stroje, úkoly, díly, vozidla |
| `VYROBA` | Výroba | Technik — stroje, úkoly, díly |
| `OPERATOR` | Operátor | Kiosk only — hlášení poruch, předfiltry, schránka důvěry |

---

## 3. Firestore — klíčové kolekce

| Kolekce | Účel | Sub-kolekce |
|---------|------|-------------|
| `users` | Profily uživatelů (PIN, role, barva) | — |
| `assets` | Zařízení, stroje, infrastruktura | `pest_logs`, `empty_logs` |
| `tasks` | Pracovní příkazy (WO-YYYY-NNN) | — |
| `inventory` | Náhradní díly a materiál | `transactions` |
| `fleet` | Vozidla a manipulační technika | — |
| `revisions` | Revize (požární, elektrické, tlakové) | `history`, `documents` |
| `waste` | Odpadové hospodářství | — |
| `inspections` | Kontrolní body budov | — |
| `inspection_templates` | Šablony kontrol | — |
| `inspection_logs` | Záznamy provedených inspekcí | — |
| `notifications` | Systémové notifikace | — |
| `trustbox` | Anonymní schránka důvěry | — |
| `stats_aggregates` | Agregovaná statistika (MTBF, MTTR) | `daily`, `weekly`, `monthly` |
| `workLogs` | Pracovní záznamy u strojů | — |
| `audit_logs` | Audit trail (append-only) | — |
| `settings` | Systémová konfigurace | — |

---

## 4. Cloud Storage — struktura bucketu

```
gs://{project-id}.appspot.com/
├── revisions/{revisionId}/       # Dokumenty revizí (PDF, DOC)
├── assets/{assetId}/             # Fotografie strojů + pest control
├── users/{userId}/               # Uživatelský avatar
└── temp/{userId}/                # Dočasné uploady
```

---

## 5. Hosting — konfigurace

- **Build output:** `dist/` (Vite production build)
- **SPA rewrite:** `** → /index.html`
- **Cache:** Static assets (JS, CSS, images) → `max-age=31536000` (1 rok)
- **Domain:** shield.vikrr.com (custom domain)

---

## 6. Environment Variables

### Povinné (Firebase)
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN={project-id}.firebaseapp.com
VITE_FIREBASE_PROJECT_ID={project-id}
VITE_FIREBASE_STORAGE_BUCKET={project-id}.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Volitelné
```env
VITE_USE_EMULATORS=false
VITE_GEMINI_API_KEY=              # Google AI Studio API klíč (pro AI modul)
```

---

## 7. Migrační checklist

- [ ] Vytvořit nový Firebase projekt (`vikrr-platform`)
- [ ] Nastavit Authentication (Email/Password provider)
- [ ] Vytvořit uživatelské účty (PIN → email mapping)
- [ ] Importovat Firestore data (`vikrr_migration.ts` export)
- [ ] Nasadit Firestore security rules
- [ ] Vytvořit kompozitní indexy
- [ ] Nahrát Storage soubory
- [ ] Nasadit Storage security rules
- [ ] Nakonfigurovat Hosting + custom domain
- [ ] Nasadit Cloud Functions
- [ ] Nastavit environment variables
- [ ] Ověřit offline persistence
- [ ] Ověřit kiosk mode (OPERATOR role)
- [ ] Spustit validaci exportu (`validateExport()`)

---

## 8. Technický stack

| Technologie | Verze |
|-------------|-------|
| React | 19 |
| TypeScript | 5.9 |
| Vite | 7 |
| Tailwind CSS | v4 |
| React Router DOM | v7 |
| Firebase JS SDK | latest |

---

*© 2026 VIKRR | Vilém Krejčí. All rights reserved.*

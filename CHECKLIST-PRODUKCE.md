# NOMINAL CMMS — CHECKLIST DO PRODUKCE

## ✅ HOTOVO (Fáze 1-7)

### UI/Frontend
- [x] LoginPage (PIN klávesnice)
- [x] DashboardPage (semafor, moduly)
- [x] TasksPage (work orders, P1-P4)
- [x] CalendarPage (týdenní plánování)
- [x] MapPage (budovy A-E + L)
- [x] AssetCardPage (kartotéka)
- [x] InventoryPage (sklad ND)
- [x] FleetPage (vozidla)
- [x] RevisionsPage (revize + dokumenty)
- [x] WastePage (odpady)
- [x] KioskPage (tablet terminál)
- [x] TrustBoxPage (anonymní schránka)
- [x] ReportsPage (statistiky)
- [x] AdminPage (správa uživatelů)
- [x] AIAssistantPage (hlasové příkazy)
- [x] NotificationsPage (upozornění)

### Systém
- [x] 6 rolí s permissions
- [x] Mock data pro testování
- [x] Tailwind v4 dark theme
- [x] Responsive design
- [x] Routing

---

## 🔄 FÁZE 8: Firebase integrace

### Firestore Collections
- [ ] `users` — uživatelé a role
- [ ] `assets` — stroje a zařízení
- [ ] `tasks` — work orders
- [ ] `inventory` — sklad ND
- [ ] `fleet` — vozidla
- [ ] `revisions` — revize a termíny
- [ ] `prefilters` — výměny předfiltrů
- [ ] `trustbox` — anonymní zprávy
- [ ] `notifications` — notifikace
- [ ] `workLogs` — historie práce

### Security Rules
- [ ] Role-based access
- [ ] Validace dat
- [ ] Audit logging

### Migrace
- [ ] Nahradit MOCK_* data
- [ ] Připojit useEffect + listeners
- [ ] Error handling
- [ ] Loading states

---

## 🔄 FÁZE 9: PWA & Offline

### Manifest
- [ ] `manifest.json`
- [ ] Ikony (192x192, 512x512)
- [ ] Theme colors
- [ ] Start URL

### Service Worker
- [ ] Cache strategie
- [ ] Offline fallback
- [ ] Background sync

### Push Notifications
- [ ] Firebase Cloud Messaging
- [ ] Permission request
- [ ] Token management

---

## 🔄 FÁZE 10: Testování

### Funkční testy
- [ ] Login všech rolí
- [ ] Vytvoření úkolu
- [ ] Hlášení z kiosku
- [ ] Schválení (Pavla)
- [ ] Export reportu

### Device testy
- [ ] Desktop Chrome
- [ ] Mobile Safari
- [ ] Tablet (velín)
- [ ] Offline mode

### Uživatelské testy
- [ ] Zdeněk — údržba workflow
- [ ] Petr — sklad + VZV
- [ ] Pavla — schvalování
- [ ] Milan — read-only přístup

---

## 🔄 FÁZE 11: Deployment

### Firebase Hosting
- [ ] `firebase init hosting`
- [ ] Build production
- [ ] Deploy
- [ ] Custom domain (optional)

### Monitoring
- [ ] Firebase Analytics
- [ ] Error reporting
- [ ] Performance monitoring

---

## 🔄 FÁZE 12: Go-Live

### Příprava
- [ ] Školení uživatelů (30 min)
- [ ] Vytištěný quick guide
- [ ] Kontakt na support (Vilém)

### Den 1
- [ ] Instalace tabletu na velín
- [ ] Založení reálných strojů
- [ ] První ostrá data

### Týden 1
- [ ] Daily check-in
- [ ] Sbírání feedbacku
- [ ] Hotfixy

---

## 📊 METRIKY ÚSPĚCHU

| Metrika | Cíl | Jak měřit |
|---------|-----|-----------|
| Adopce | 80% týmu používá | Login count |
| Poruchy | 100% přes systém | Telefonů = 0 |
| Reakce P1 | <30 min | Timestamp |
| Spokojenost | 4/5 | Anketa po měsíci |

---

## ⏱️ ODHAD ČASU

| Fáze | Čas | Kdo |
|------|-----|-----|
| Firebase integrace | 2-3 dny | Vilém |
| PWA setup | 1 den | Vilém |
| Testování | 3-5 dní | Tým |
| Deployment | 1 den | Vilém |
| Školení | 1 den | Vilém + tým |

**Celkem: 8-11 pracovních dní do produkce**

---

## 🚨 RIZIKA

| Riziko | Pravděpodobnost | Řešení |
|--------|-----------------|--------|
| Wi-Fi výpadky | Vysoká | Offline-first |
| Odpor uživatelů | Střední | Zapojit do vývoje |
| Bugy v produkci | Střední | Soft launch |
| Ztráta dat | Nízká | Firebase backups |

---

*Poslední aktualizace: 15.2.2026*

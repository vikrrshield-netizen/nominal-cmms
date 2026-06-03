# Compliance mapa - IFS Food + Tesco

Ucel: ukazat, co musi VIKRSHIELD dokazovat pri auditu IFS Food / Tesco a ktery modul to pokryva.

Tento dokument neni certifikacni vyklad normy. Je to pracovni mapa pro vyvoj aplikace a pro kontrolu s QA / auditorem.

Stav:
- OK = appka uz dukaz umi drzet.
- CASTECNE = zaklad existuje, ale chybi povinne pole, workflow nebo report.
- GAP = chybi modul nebo zasadni evidence.

## 1. Zakladni princip

Pro IFS/Tesco nesmi byt zaznam jen "poznamka". Musi odpovedet na otazky:

- kdo to provedl
- kdy to provedl
- kde to provedl
- na cem to provedl
- co presne se stalo
- jake bylo food safety riziko
- jak bylo overeno, ze je stav bezpecny
- kdo to prevzal nebo precetl

## 2. Jak appka podporuje audit

- Casova stopa: `createdAt`, `updatedAt`, `performedAt`, `completedAt`.
- Autor: `userId`, `userName`, `authorId`, `performedBy`.
- Vazba na zarizeni: `assetId`, `assetName`, pripadne navazany extruder / prevodovka.
- Nemennost zaznamu: append-only logy jako `audit_logs`, `entity_logs`, `inspection_run_logs`, `workLogs`.
- Role a prava: RBAC + individualni grant/revoke.
- Reporty: exporty a auditni prehledy podle obdobi.

## 3. Mapa pozadavku

| Oblast | Co musi byt dokazatelne | Modul | Dukaz v appce | Stav |
|---|---|---|---|---|
| Udrzba a opravy | Planovana a napravna udrzba, historie oprav | Ukoly, Denik praci | `tasks`, `workLogs` | CASTECNE |
| Preventivni udrzba | Plan, intervaly, splneni, odchylky | Ukoly, Kontroly | opakovane ukoly, `inspection_logs` | CASTECNE |
| Zarizeni / asset register | Seznam stroju, umisteni, stav | Kartoteka | strom budova-mistnost-zarizeni | OK |
| Prevodovky | Pohyb sklad-servis-extruder, teploty, opravy | Prevodovky | `gearbox_installation_events`, `gearbox_temperature_logs`, `workLogs` | OK |
| VZT a filtry | Vymeny filtru, historie jednotek | Vzduchotechnika | VZT karty, vymeny, historie | CASTECNE |
| Predfiltry extruderu | Vymena hrubych filtru nad extrudery | Kiosk, VZT | `prefilters`, work log | OK |
| Kontaminace po udrzbe | Uklid, naradi, dily, material po oprave | Denik praci, Ukoly | `cleaningDone`, `cleaningChecked`, poznamka | CASTECNE |
| Food safety riziko | Riziko, typ nebezpeci, dopad | Ukoly, Kontroly | `foodSafetyRisk`, `foodSafetyHazardType`, `foodSafetyImpact` | CASTECNE |
| Napravna opatreni | Zavada -> ukol -> oprava -> overeni | Kontroly, Ukoly, Reporty | defect task, completion, audit trail | OK |
| Sklad nahradnich dilu | Prijem, vydej, inventura, stav po pohybu | Sklad ND | `inventory`, `inventory_transactions` | OK |
| Pouzite dily u opravy | Co bylo pouzito pri ukolu | Ukoly, Sklad ND | `usedParts`, skladove transakce | OK |
| Food-grade maziva | Mazivo vhodne pro potravinarsky provoz | Sklad ND | zatim neni flag food-grade | GAP |
| Metal detekce | Verifikace, frekvence, vysledek | Kontroly / budouci modul | zatim obecne kontroly | CASTECNE |
| Sklo a krehky plast | Registr a pravidelne kontroly | chybi | neni registr | GAP |
| Pest control | Monitoring skudcu | Kartoteka / kontroly | `pest_logs` / kontroly | CASTECNE |
| Kalibrace meridel | Intervaly, certifikaty, historie | Revize / budouci modul | revize obecne | CASTECNE |
| Skoleni | Kdo absolvoval jake skoleni a kdy | Academy | obsah existuje, osobni evidence chybi | CASTECNE |
| Predani smeny | Dulezite zpravy, adresati, potvrzeni | Kiosk / smeny | `shiftNotes` | CASTECNE |
| Schranky / speak-up | Anonymni podnety a cteni vedenim | Schranky duvery | `trustbox` | OK |
| Zmeny prav | Kdo komu zmenil pristup | Admin | zatim nutno doplnit audit log | CASTECNE |
| Retence zaznamu | Jak dlouho se zaznamy drzi a exportuji | Reporty / pravidla | export existuje, politika chybi | CASTECNE |

## 4. Hlavni gapy

1. Registr skla a krehkeho plastu.
2. Food-grade maziva ve skladu.
3. Kalibrace meridel s intervalem a certifikatem.
4. Samostatny log pro metal detekci.
5. Docasne opravy: priznak, duvod, termin trvale opravy.
6. Povinne potvrzeni uklidu po udrzbe u food-contact stroju.
7. Audit log zmen prav v administraci.
8. Evidence absolvovani skoleni po osobach.
9. Retencni politika a auditni export balicku.
10. Potvrzeni precteni dulezitych zprav pri predani smeny.

## 5. Navrzene poradi prace

### Faze A - rychle posileni dukazu

- logovat zmeny prav do `audit_logs`
- u dokoncenych oprav vynutit hygienu po praci
- dotahnout food safety pole v UI ukolu a kontrol
- u predani smeny pridat potvrzeni precteni

### Faze B - food safety registry

- registr skla a krehkeho plastu
- food-grade maziva ve skladu
- kalibrace meridel
- metal detekce

### Faze C - audit pack

- report "IFS/Tesco audit pack"
- export za obdobi
- historie stroje, VZT, filtru, skladu, zavad a prav
- priprava pro auditor / Tesco navstevu

## 6. Pravidlo pro dalsi vyvoj

Nova funkce je hotova az tehdy, kdyz:

1. zapise autora
2. zapise cas
3. zapise vazbu na zarizeni nebo misto
4. ma auditni stopu
5. ma jasne opravneni
6. jde dohledat v reportu

Bez toho je to jen operativni funkce, ne IFS/Tesco dukaz.

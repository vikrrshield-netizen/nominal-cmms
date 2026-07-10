# CÍLOVÁ ČÁRA — dotáhnout k reálným číslům

> Rozhodnutí majitele 2026-07-10: „Chtěl bych dělat vše, umět vše, ale málokdy vše dotáhnu —
> a chci s tím něco udělat a začít právě touto aplikací."
> **Tenhle soubor je cíl. Všechno ostatní (plány došperkování, rozšíření) jsou jen cesty k němu.**

## ⭐ PRAVIDLO DOTAHOVÁNÍ (pro každou session, každý model)
1. Nová funkce se dělá JEN, když prokazatelně slouží cílům 1–3 níže. Jinak → zapsat do backlogu a NEDĚLAT.
2. Každá session se má ptát: „posunulo se dnes některé ČÍSLO k cíli?" — ne „co dalšího přidáme?".
3. Když si majitel řekne o novou věc, klidně ji udělej — ale připomeň, kde stojí vůči cílové čáře.

---

## CÍL 1 — Firma to žije (adopce) 🏭
**Hotovo, když (měřitelné):**
- [ ] ≥ 8 lidí používá appku každý týden (technici + operátoři přes kiosk)
- [ ] ≥ 5 zápisů do Deníku denně (průměr za týden)
- [ ] ≥ 80 % poruch se hlásí PŘES APPKU (kiosk/AI/QR), ne ústně
- [ ] QR štítky nalepené na klíčových strojích (extrudery, balicí linky, převodovky)
- [ ] preventivní plán nastavený na všech kritických strojích (doktor kartotéky: 0 kritických „bez plánu")

**Cesta:** zaškolit lidi (Návody + kiosk), nalepit QR, nastavit události. Čísla adopce ukázat v Dohledu
(dávka C1 níže). Cílový termín: **31. 8. 2026** (uprav podle sebe).

## CÍL 2 — Audit zvládnutý s appkou 🛡️
**Hotovo, když:**
- [ ] 100 % strojů má preventivní plán (doktor: 0× „bez plánu")
- [ ] kalibrace měřidel: 0 propadlých; detektory: 0 bez testu
- [ ] sklo (D3), hygienické uvolnění (D5), dočasné opravy (D6) — dávky hotové
- [ ] „Audit balíček" vytištěný a projitý s kvalitářkou — obsah odsouhlasen
- [ ] při reálném auditu: **0 neshod kvůli dokumentaci údržby**

**Cesta:** dávky D3/D5/D6 z PLAN-DOSPERKOVANI.md + naplnit data (měřidla, detektory — majitel).
Cílový termín: **před příštím auditem — ⚠️ DOPLNIT DATUM AUDITU (zeptat se majitele!)**.

## CÍL 3 — PROVOZ 360 = peníze 💰
**Hotovo, když:**
- [ ] pitch vedení nominal proběhl (POZOR: ochrana autorství — viz paměť `provoz360-pilot-pitch`, ne „zaměstnanecké dílo")
- [ ] dohodnutá cena za provoz pro nominal (návrh pásma: 3–6 tis. Kč/měs.; benchmark FoodDocs ~2 tis. a umí zlomek)
- [ ] první EXTERNÍ firma jede na vlastní instanci (kuchařka: vikrr-web/docs/ONBOARDING-NOVA-FIRMA.md)
- [ ] první faktura 🎉

**Cesta:** pitch podložit čísly z Cíle 1+2 (adopce, audit) — proto je pořadí 1 → 2 → 3.
Cílové termíny: pitch **do 30. 9. 2026**, první firma **do 31. 12. 2026** (uprav podle sebe).

---

## Dávka C1 — Čísla adopce v Dohledu (malá; udělat brzy)
**Cíl:** aby šel Cíl 1 MĚŘIT. Do OversightPage (panel „Žijí data") doplnit: aktivních uživatelů za 7 dní
(workLogs+tasks distinct userId), zápisů/den (průměr 7 dní), % úkolů založených z kiosku/AI (source pole).
Jen čtení, žádné rules. Pak stejná čísla přidat do týdenního AI souhrnu (gatherSummaryData).

## Stav (aktualizovat při každém posunu)
- 2026-07-10: cílová čára založena. Appka funkčně připravená (kartotéka, preventivka, kalibrace,
  detektory, QR, AI, audit balíček, dohled). Teď se DOTAHUJE: data + lidi + čísla, ne nové funkce.

# PLÁN ROZŠÍŘENÍ — z trendů CMMS 2025–2026 (rešerše 2026-07-04)

> Navazuje na `PLAN-DOSPERKOVANI.md` — **platí stejná ZLATÁ PRAVIDLA (sekce 0)**, přečti je před každou dávkou.
> Zdroj: webová rešerše trendů (MaintainX, Fiix, Limble, Verdantix, BRCGS/IFS zdroje…) porovnaná s tím, co appka UŽ má.
> Klíčová lekce z rešerše: 60–70 % AI/PdM projektů selže na špatných datech a přeskočených základech.
> My základy máme (čistá data, disciplína zápisů, AI s potvrzováním) → stavět po malých pilotech, AI vždy jen NAVRHUJE.

## Co trendy chtějí a MY UŽ MÁME (nestavět!)
- AI copilot/chat nad daty ✅ (/ai + kiosk: čte stroje, úkoly, sklad, revize, deník, strukturu; akce s potvrzením; paměť)
- Foto → hlášení/úkol/štítek ✅ · Hlas (diktování v kiosku, předčítání) ✅ · QR na strojích ✅
- Preventivní údržba (auto-úkoly z termínů) ✅ · Teplotní trendy převodovek + prahy ✅ · Dataloggery ✅
- Paperless audit trail ✅ (workLogs + audit_logs + fotky; hygienické uvolnění a dočasné opravy jsou v PLAN-DOSPERKOVANI D5/D6)
- Hlídání opakovaných poruch (3×/30 dní → návrh prevence) ✅

## OVERKILL pro naši velikost (vědomě NEděláme)
Prescriptivní AI platformy, SCADA/IIoT pipeline, digital twin, plná AI optimalizace rozvrhu, drahá senzorová pole.
(IoT teploměry do chladíren = zaparkováno — dává smysl, ale je to hardware; řešit až bude chtít uživatel.)

---

## DÁVKA T1 — AI poradce příčin poruchy (malá; čistě prompt+data)
**Trend:** diagnostika z popisu/fotky nad VLASTNÍ historií oprav (obecná AI nezná náš extruder — naše historie ano).
**Cíl:** když uživatel hlásí poruchu (chat/kiosk/foto), AI se sama podívá do historie oprav toho stroje a nabídne: „u tohohle stroje se 3× řešilo X — zkontroluj Y" + rovnou návrh úkolu.
**Postup:** `functions/src/assistant.ts` → buildSystemPrompt: přidat pravidlo „při hlášení poruchy NEJDŘÍV zavolej get_asset_detail (má posledních N prací) a search_worklogs pro daný stroj; z historie navrhni pravděpodobné příčiny; pak teprve create_task s popisem vč. tipů". Ověř, že get_asset_detail vrací dost historie (případně zvyš limit posledních prací). Žádný nový nástroj.
**Ověření:** ručně v /ai: „extruder 2 nejede" → odpověď má obsahovat odkazy na minulé opravy. Deploy `functions:assistantChat`.

## DÁVKA T2 — Hlídač zanedbané preventivky (malá)
**Trend:** „AI upozorní, že se PM přeskakuje / stroj má rostoucí četnost závad" (Fiix: −80 % prostojů z dodržování PM).
**Cíl:** týdenní AI souhrn + doktor kartotéky řeknou: (a) preventivní úkoly po termínu nedokončené >7 dní, (b) stroje s rostoucí četností závad (≥3 poruchy/30 dní už hlídá repairWarning — přidat do souhrnu).
**Postup:** `functions/src/assistant.ts` → `gatherSummaryData`: spočti otevřené tasky `source=='preventive'` starší 7 dní (createdAt) + top stroje dle poruch; přidej do promptu weekly/monthly souhrnu. `KartotekaPage` doktor: warn „N× preventivní úkol leží přes týden".
**Deploy:** functions:weeklyAiSummary,monthlyExecReport (sdílený soubor → build + deploy obou), hosting.

## DÁVKA T3 — AI výrobce postupů (SOP) z manuálu (střední; velká audit hodnota)
**Trend:** fotka/PDF manuálu → AI vygeneruje krok-za-krokem postup údržby; auditoři chtějí dokumentované postupy.
**Cíl:** na kartě stroje tlačítko „Vytvořit postup z manuálu": vyfotíš stránku manuálu (nebo popíšeš úkon) → AI navrhne postup (kroky, bezpečnost, díly) → uživatel zkontroluje/upraví → uloží se k stroji (pole `procedures` nebo dokument) a dá se přiložit k úkolu.
**Postup:** klient: AssetCardPage nová akce (vzor „QR štítek" tlačítka) → BottomSheet s fotoinputem (vzor KioskAssistant fileToImage) → `assistantChat` s promptem „z fotky manuálu vytvoř český postup údržby, kroky očísluj" → náhled → uložit `assetService.update` do pole `procedures[]` {title, steps[], createdAt, approvedBy}. AI negeneruje nic bez lidského schválení (halucinace v postupu = riziko!).
**Rozhodnutí uživatele:** kam postup ukládat (k stroji vs. samostatná kolekce) — zeptat se.

## DÁVKA T4 — Sanitační plán / SSOP (větší; nejčastější zdroj auditních neshod!)
**Trend:** digitální sanitace = master sanitation schedule + checklisty podle hygienických zón + verifikace před uvolněním; ~40 % úspora času na přípravu auditu.
**Cíl:** sanitační úkoly (čištění linky/prostoru) s vlastním checklistem, plánované automaticky (už umí preventivka), s fotkou/verifikací a uvolněním „čisté — smí se vyrábět".
**Postup (fázovat):** F1: sanitační události = preventivní údržba s `eventType:'sanitace'` (funguje hned, jen konvence + návod). F2: checklist šablona na události (pole `checklist[]` v events, TasksPage odškrtávání). F3: verifikace = hygienické uvolnění z PLAN-DOSPERKOVANI D5 (sdílet mechanismus!). Stavět AŽ PO D5.
**Rozhodnutí uživatele:** zóny a četnosti (co se čistí denně/týdně) — dodá firma.

## DÁVKA T5 — Alergenový changeover (střední; chce ho Tesco)
**Trend:** vynucený checklist při přechodu mezi produkty s různými alergeny (čištění, oplach, kontrola) — bez splnění se linka „neuvolní".
**Cíl:** ve Výrobě při změně produktu na lince nabídnout „changeover checklist" (kroky čištění dle alergenů) a zapsat jeho splnění (kdo, kdy, fotka) k šarži.
**Postup:** navazuje na ProductionPage (šarže/receptury). Nejdřív MOCKUP + potvrdit s uživatelem, jak přechody reálně probíhají (které alergeny, které linky). Data: `changeovers` záznam u šarže. Bez rules změn.

## DÁVKA T6 — Monitoring pro všechny stroje (větší; už naplánováno dřív)
**Trend:** prediktivní údržba z jednoduchých dat (ruční ampéry/teploty + prahy + trend) — bez drahých senzorů; začít u 5–10 kritických strojů (extrudery), NE u všech 174.
**Cíl+postup:** viz paměť `monitoring-module-generalization` (teplota=převodovka, ampéry=stroj; mění datový model → fázovat, plán schválit). Pilot: extrudery.

## Pořadí (doporučené)
| Dávka | Velikost | Hodnota | Kdy |
|---|---|---|---|
| T1 AI příčiny | S | vysoká (denní provoz) | hned |
| T2 hlídač preventivky | S | vysoká | hned |
| T3 AI postupy (SOP) | M | vysoká (audit) | po T1 |
| T4 sanitace/SSOP | L | nejvyšší (audit) | po D5 z došperkování |
| T5 alergen changeover | M | vysoká (Tesco) | po T4, mockup-first |
| T6 monitoring všech strojů | L | vysoká (prostoje) | samostatný projekt, pilot extrudery |

**Poznámka pro business (PROVOZ 360):** rešerše potvrdila, že segment „malý závod + velké audity (IFS/BRC/Tesco)" je rostoucí trh (benchmark: FoodDocs ~79 €/měs./provoz) — naše kombinace CMMS + food-safety + AI je oproti tomu výrazně dál. Argument pro pilot pitch.

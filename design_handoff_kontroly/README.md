# Handoff: Kontroly (Inspections) — návrh B

## Overview
Tato složka popisuje obrazovku **Kontroly** pro NOMINAL CMMS — měsíční/týdenní hygienické a provozní kontroly budov. Uživatel (inspektor) vidí, co je „teď k provedení", odbavuje jednotlivé kontrolní body (OK / Závada) a přes **modal** kdykoliv otevře detail bodu, zapíše stav, kategorii + dopad závady, poznámku a nahraje fotodokumentaci.

Cílem handoffu je **přenést tento HTML návrh do reálné aplikace `nominal-cmms`** za použití jejích stávajících vzorů — ne nasadit přiložené HTML přímo.

## About the Design Files
Soubory v balíčku jsou **designové reference vytvořené v HTML** — prototyp ukazující zamýšlený vzhled a chování, **ne produkční kód k přímému zkopírování**. Úkolem je tyto návrhy **znovu postavit ve stávajícím prostředí codebase `nominal-cmms`** (zjisti si z repa, jaký framework/knihovny se používají — React/Vue/jiné — a drž se jeho zavedených vzorů). Pokud prostředí ještě neexistuje, zvol nejvhodnější framework.

## Fidelity
**High-fidelity (hifi).** Návrh má finální barvy, typografii, spacing i interakce — viz Design Tokens. Recreate pixel-perfect pomocí existujících knihoven codebase. Data jsou zatím **mock (frontend-only)** — modal s fotkami/poznámkou zatím nikam neukládá; backend napojení je samostatný krok (viz State Management).

## Screens / Views

### 1. Kontroly — hlavní obrazovka
- **Purpose**: Inspektor odbavuje kontrolní body za daný měsíc; vidí co je hotovo, co chybí, kde jsou závady.
- **Layout**: App shell `1440px`, grid `236px sidebar | 1fr main`. Main obsah je grid `1fr | 336px` (seznam + pravý panel). Sidebar tmavá (`#1c241f`), zbytek na pískovém pozadí (`--sand #f0eee9`).
- **Hlavička (`.top`)**: sticky, tlačítko zpět + titulek „Kontroly" se zelenou ikonou checklistu, vpravo měsíční navigace (`‹ Červen 2026 ›`) a akční tlačítka.

#### Komponenty
- **„Teď provést" karta (`.nowcard`)** — zvýrazněná amber karta (`linear-gradient(#fcf6e8,#fff)`, border `#ecd9ad`). Obsahuje seznam bodů k odbavení (`.qitem`): název, lokace + frekvence, frekvenční chip (amber), a akce **OK** (zelená plná) / **Závada** (bílá, červený border).
  - `.qitem` hover: border `#e9d9ab`, zvedne se (`translateY(-1px)`) + měkký amber stín.
- **Checklist skupiny (`.grp`)** — sekce po zónách (např. „Budova C — 1.NP"). Hlavička skupiny: název + **mini progress bar** (`.gprog`, šířka = % hotovo, výplň `--green-2`) + chip „3/8 hotovo".
  - **Řádky (`.row`)**: status ikona (OK = zelený check, Závada = červený trojúhelník, Čeká = šedý čárkovaný), název bodu, kód + frekvence + **iniciály a čas inspektora** (`09:12 · PK`, třída `.by`, mono, světle šedá). U závad červená poznámka + **foto chip** (`.evi` „2 foto" s ikonou fotoaparátu). Vpravo odkaz na úkol (`.tasklink`, modrá).
  - `.row` hover: pozadí `#faf8f3`.

### 2. Modal — Provést kontrolu (`#kModal`)
- **Purpose**: Otevře se **kdykoliv** kliknutím na název bodu nebo na tlačítko OK/Závada. Inspektor v něm zapisuje výsledek.
- **Otevírání**: klik na `.qitem .rm` nebo `.row .info` → otevře neutrální; klik na `.act-ok`/`.act-bad` → otevře a rovnou nastaví stav OK/Závada.
- **Layout**: centrovaný dialog `560px`, `border-radius:22px`, overlay `rgba(24,28,22,.5)` + `blur(3px)`. Vstupní animace: `mpop` (fade + scale + posun nahoru, `.22s`). Tři části — hlavička / scrollovatelné tělo / patička.
  - **Hlavička**: eyebrow „Kontrolní bod" + název bodu (`Space Grotesk 21px/700`) + meta (kód · frekvence, mono).
  - **Segment stav (`.seg`)**: 2 dlaždice — **Bez závady** (při výběru zelená `--green-tint`) / **Závada** (červená `--red-tint`). Single-select.
  - **Defekt blok (`.defwrap`)**: zobrazí se jen u stavu „Závada" (animace fade). Obsahuje **Kategorie** (chips: Cizí předmět, Hygiena, Škůdci, Konstrukce, Teplota, Ostatní) a **Dopad** (chips: Nízký/Střední/Vysoký, vybraný amber). Single-select v každé skupině.
  - **Poznámka**: `<textarea>`, focus border `--green-2`.
  - **Fotodokumentace (`.photos`)**: 3 sloty `84×84px`, čárkovaný border. Po výběru souboru ukáže náhled (`background-image` z `URL.createObjectURL`), border se zplní zeleně.
  - **Patička (`.mfoot`)**: vlevo „Zrušit", vpravo „Uložit a další ›" (ghost) + „Uložit bod" (zelená, ikona check).
- **Zavření**: ✕ vpravo nahoře, klik na overlay (`[data-close]`), klávesa `Esc`. Při otevření se zamkne scroll body.

## Interactions & Behavior
- **Stav segment toggle**: klik na dlaždici nastaví `.on` (jen jedna), a `.show` na `.defwrap` při „bad".
- **Chips single-select**: klik vybere/odznačí (`.sel`), v rámci skupiny vždy max 1.
- **Foto náhled**: `input[type=file]` change → preview přes objectURL, slot dostane `.filled`.
- **Reset formuláře**: při každém otevření modalu (`resetForm()`) se vyčistí stav, chips, poznámka i fotky.
- **Animace**: overlay `mfade .18s`, karta `mpop .22s cubic-bezier(.2,.9,.3,1.2)`. Hover stavy 0.12–0.15s.
- Navigace, tlačítka, řádky a karty mají hover/active stavy (viz tokens / CSS).

## State Management
Pro reálnou implementaci je potřeba:
- **Stav obrazovky**: vybraný měsíc; seznam kontrolních bodů se stavem `ok | bad | wait`, lokací, frekvencí, inspektorem (iniciály), časem uzavření, % hotovo na zónu.
- **Stav modalu** (form): `pointId`, `status (ok/bad)`, `category`, `severity`, `note`, `photos[]` (File / upload refs), `inspector`, `timestamp`.
- **Akce při uložení** (zatím mock): `Uložit bod` zavře modal; `Uložit a další` by měl posunout na další bod ve frontě. Backend napojení (uložení záznamu + upload fotek) je TODO — aktuálně se nic neperzistuje.

## Design Tokens
```
/* Barvy */
--sand:#f0eee9; --sand-2:#e9e5dd; --card:#ffffff;
--ink:#1d2520; --ink-2:#454c44; --muted:#7c8278; --faint:#a7ab9f;
--line:#e7e2d8; --line-2:#efece4;
--green:#1f8a5b; --green-2:#2e9e74; --green-deep:#16623f; --green-tint:#e8f3ec;
--red:#cf4a36; --red-deep:#a83a28; --red-tint:#fbeae6;
--amber:#cf8a1f; --amber-deep:#9a6510; --amber-tint:#f8efdc;
--blue:#3c7ba0; --blue-tint:#e7f0f5;

/* Radius */ --r:18px; --r-sm:12px; modal:22px; chip:8–10px; dlaždice:14px;
/* Shadow */ --shadow:0 1px 2px rgba(40,36,28,.05), 0 6px 18px -10px rgba(40,36,28,.18);
            modal:0 40px 90px -30px rgba(20,24,18,.6);

/* Typografie */
--sans:"Hanken Grotesk"  (400/500/600/700/800)  — UI text
--disp:"Space Grotesk"   (500/600/700)          — nadpisy
--mono:"JetBrains Mono"  (500/600/700)          — meta, kódy, chips, iniciály/čas
```
Velikosti: h1 24px, modal titulek 21px, název bodu 14.5px, meta 12.5px, eyebrow 10.5px mono uppercase.

## Assets
- **Fonty**: Google Fonts — Hanken Grotesk, Space Grotesk, JetBrains Mono.
- **Ikony**: inline SVG (stroke, žádná knihovna) — check, varovný trojúhelník, fotoaparát, chevrony. Lze nahradit ikonami z codebase.
- **Fotky v modalu**: nahrává uživatel za běhu (file input), žádné statické assety.

## Files
- `NOMINAL CMMS - Kontroly návrh B.html` — kompletní prototyp obrazovky Kontroly + modal (CSS + JS uvnitř).

# VIKRSHIELD - role a opravneni

Tento dokument popisuje prakticky, co maji jednotlive role v aplikaci videt a delat.
Technicke permission klice jsou v `src/types/user.ts` a ve `firestore.rules`.

## Zakladni princip

- **Vidim modul** neznamena automaticky **muzu zapisovat**.
- Zapis musi projit dvakrat: v UI pres `hasPermission(...)` a v databazi pres `firestore.rules`.
- Kiosk/OPERATOR je nejuzsi role. Ma jen hlasit a zapisovat jednoduche provozni udaje.
- MAJITEL ma byt primarne read-only, s vyjimkou schvalovani/nahlizeni do citlivych veci.

## Role podle provozu

### MAJITEL

Ucel: celkovy dohled, cteni, finance, schvalovani.

Muze:
- videt ukoly, stroje, vozidla, reporty, audit
- videt finance
- videt Schranku duvery
- schvalovat nakupy
- videt administraci read-only

Nema:
- upravovat bezne technicke zaznamy
- menit stroje, sklad, vozidla
- mazat data

Poznamka: role je `isReadOnly: true`.

### VEDENI

Ucel: rizeni provozu, schvalovani, uzivatele, planovani.

Muze:
- cist a schvalovat ukoly
- spravovat vozovy park
- spravovat uzivatele
- videt reporty, audit, finance
- upravovat tydenni plan
- videt sklad vyroby a smeny

Nema:
- videt Schranku duvery, pokud to nema explicitne prideleno
- technicky spravovat system jako superadmin

### SUPERADMIN

Ucel: technicka sprava aplikace.

Muze:
- spravovat ukoly, stroje, prevodovky, sklad ND, vozidla
- spravovat uzivatele a administraci
- cist reporty a audit
- spravovat opakovane ukoly, vyrobu, smeny

Nema:
- finance
- Schranku duvery
- schvalovani nakupu, pokud to neni explicitne prideleno

### UDRZBA

Ucel: stroje, opravy, prevodovky, sklad ND pro praci.

Muze:
- zakladat, upravovat, cist a zavirat ukoly
- cist a upravovat stroje
- zapisovat teploty prevodovek
- menit stav a prirazeni prevodovek
- prijimat a vydavat sklad ND v rozsahu prace
- cist vozovy park
- videt reporty, planovani, vyrobu, sklad vyroby, smeny

Nema:
- mazat ukoly
- mazat stroje
- spravovat uzivatele
- finance a Schranku duvery

Poznamka: pokud nechceme, aby udrzba videla flotilu, odebrat `fleet.read` z role UDRZBA.

### VYROBA

Ucel: provoz, priority, planovani prace z pohledu vyroby.

Muze:
- zakladat a cist ukoly
- schvalovat/planovat praci podle provozu
- cist stroje
- zapisovat teploty prevodovek
- menit zony
- upravovat tydenni plan
- videt vyrobu, sklad vyroby, smeny, kontroly, vybrane reporty

Nema:
- upravovat technicka data stroju
- spravovat sklad ND
- spravovat vozovy park
- mazat data

### SKLADNIK

Ucel: sklad ND, prijem, vydej, inventura, objednavky.

Muze:
- zakladat/cist/upravovat pracovni ukoly souvisejici se skladem
- cist kartoteku stroju jen kvuli vazbe dilu
- prijem, vydej, inventura, sprava skladovych polozek
- tvorit objednavky
- videt skladove reporty
- spravovat opakovane skladove cinnosti

Nema:
- videt flotilu/vozovy park
- upravovat stroje
- menit prevodovky na extruderech
- spravovat uzivatele
- finance a Schranku duvery

Aktualni stav:
- frontend modul flotily pro SKLADNIK neni zapnuty
- Firestore `/entities` je zamerne omezen jen na `fleet.read/fleet.manage`, aby se skladnik k flotile nedostal ani primo pres SDK

### OPERATOR

Ucel: tablet/kiosk v provozu.

Muze:
- nahlasit poruchu
- cist vybrane ukoly/zarizeni pro kiosk
- zapisovat teploty prevodovek

Nema:
- spravovat ukoly
- upravovat stroje
- videt skladove, flotilove, administracni nebo financni moduly
- mazat data

## Specialni moduly

### Vozovy park / flotila

Povoleno:
- MAJITEL: cteni
- VEDENI: sprava
- SUPERADMIN: sprava
- UDRZBA: cteni, pokud to provozne chcete

Nepovoleno:
- SKLADNIK
- VYROBA
- OPERATOR

### Sklad ND

Povoleno:
- SUPERADMIN: sprava
- UDRZBA: prijem/vydej pro praci
- SKLADNIK: plna skladova prace

Omezene:
- VYROBA/MAJITEL/VEDENI podle potreby jen reporty nebo schvalovani

### Prevodovky

Povoleno:
- UDRZBA/SUPERADMIN: stav, servis/sklad, prirazeni, opravy
- VYROBA/OPERATOR: zapis teploty a nahlaseni problemu
- SKLADNIK: nema menit pohyb prevodovek

### Schranka duvery

Povoleno:
- MAJITEL: cteni a zpracovani

Nepovoleno:
- SUPERADMIN, UDRZBA, SKLADNIK, OPERATOR bez explicitniho povoleni

## Doporučení pro dalsi upravy

1. Zkontrolovat, jestli UDRZBA opravdu ma mit `fleet.read`.
2. Rozdelit `asset.read` na:
   - `asset.read`
   - `asset.update`
   - casem pripadne `asset.limitedRead`, pokud skladnik ma videt jen stroje kompatibilni s dilem.
3. Udelat admin obrazovku "Role a prava" lidsky:
   - modul
   - muze videt
   - muze zapisovat
   - muze mazat
   - poznamka proc

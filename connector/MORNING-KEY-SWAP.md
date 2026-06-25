# Ráno: omezit klíč konektoru (z „plný admin" na „jen čtení)

Audit doporučil: konektor má teď klíč s plnými právy. Vyrobíme **omezený klíč jen na čtení** a ten plný zrušíme. ~5 minut, provedu tě.

## Proč
- Teď: kdyby klíč unikl, jde s ním všechno (číst i mazat).
- Po změně: klíč umí **jen číst** → mnohem bezpečnější.

## Kroky (řekni mi, až budeš u toho — některé udělám za tebe)

1. **console.cloud.google.com** → projekt **nominal-cmms** → **☰ → IAM & Admin → Service Accounts.**
2. **+ Create service account** → název `cmms-connector-read` → **Create and continue.**
3. **Role:** vyber **Cloud Datastore Viewer** (jen čtení) → **Continue → Done.**
4. Klikni na nový účet → **Keys → Add key → JSON** → stáhne se nový `.json`.
5. **Napiš mi cestu** k novému souboru → **já přepnu konektor** na nový klíč (v nastavení Claude Desktop) a restartuješ.
6. Ověříme, že čtení dál funguje (zeptáš se „kolik mám zařízení").
7. Až to půjde, **starý „adminsdk" klíč zrušíme** (Firebase → Project settings → Service accounts → ten starý klíč → smazat / nebo v Google Cloud u účtu `firebase-adminsdk-…` smazat ten konkrétní klíč).

## Pozn. k psaní (Fáze 2)
- Jakmile budeš chtít, aby konektor i **zapisoval** (Deník, úkoly), klíč bude potřebovat **Datastore User** (čtení + zápis) místo Viewer. Vyřešíme podle toho, jestli psaní zapneš.

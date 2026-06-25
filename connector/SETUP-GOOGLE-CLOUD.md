# Co máš udělat — krok za krokem (pro majitele)

Cílem je dát konektoru „klíč", kterým bezpečně **ČTE** tvoji databázi. Je to jen klikání, ~5 minut. Dělej to v klidu.

## 📍 Celá cesta (kdo co dělá)

1. 🔑 **TY (teď):** stáhneš klíč z Firebase a napíšeš mi cestu k souboru.
2. 🧪 **JÁ:** otestuju, že čtení funguje, a ukážu ti to.
3. 🚀 **JÁ (ty jen potvrdíš):** nasadím konektor na internet (Cloud Run).
4. 🔌 **TY:** připojíš konektor v Claude (jedno přihlášení).
5. 💬 **TY:** ptáš se appky normální řečí. Hotovo!

---

## 🔑 STOP 1 — co děláš TEĎ (stáhnout klíč)

Jsi přihlášený v **Firebase konzoli** (console.firebase.google.com), projekt **nominal-cmms**.

1. Vlevo nahoře klikni na **⚙ ozubené kolečko** (vedle „Přehled projektu") → **Nastavení projektu** (Project settings).
2. Nahoře přepni na záložku **Servisní účty** (Service accounts).
3. Klikni na tlačítko **Vygenerovat nový soukromý klíč** (Generate new private key) → potvrď **Vygenerovat klíč**.
4. Stáhne se **soubor `.json`** (něco jako `nominal-cmms-firebase-adminsdk-….json`).
5. **Ulož ho** k sobě, ať ho najdeš — třeba si udělej složku `C:\vikrr\` a dej ho tam.
6. **Napiš mi celou cestu** k tomu souboru (např. `C:\vikrr\nominal-cmms-firebase-adminsdk-abc.json`).

A to je z tvojí strany **zatím všechno.** 🎉

> 🔒 **Bezpečnost:** Ten soubor je jako hlavní klíč — **nikomu ho neposílej, nedávej na web.** Zůstane jen u tebe na počítači (já ho čtu lokálně při testu). Po testu ho můžeš jedním klikem smazat (ve stejné záložce). Na ostro pak konektor poběží s **omezeným účtem jen na čtení, bez klíče.**

---

## Co bude potom (nemusíš nic dělat, jen přehled)

- **JÁ** s klíčem otestuju čtení (uvidíš výpis tvých dat přes konektor).
- **JÁ** přidám přihlášení (OAuth) a připravím nasazení; na vypuštění ven si vyžádám tvoje **✅ POTVRĎ**.
- **TY** pak v **Claude → Nastavení → Konektory → Přidat vlastní konektor** vložíš URL (dám ti ji) a projdeš **jedním přihlášením**.
- **TY** to vyzkoušíš. Když bude vše OK, pustíme **Fázi 2** (zápis do Deníku, zakládání úkolů).

## Časté otázky

- **Stojí to něco?** Ne, free tier stačí.
- **Můžu to vzít zpět?** Ano — klíč i konektor jdou kdykoliv smazat.
- **Vidí někdo cizí moje data?** Ne. Klíč máš jen ty, konektor bude jen tvůj.

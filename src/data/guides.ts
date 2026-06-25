// src/data/guides.ts
// VIKRR — Asset Shield — Návody „Jak na to". Krok za krokem, dětsky jednoduše.
// **tučně** zvýrazní název tlačítka/sekce. Texty drž krátké a v jednom kroku jedna akce.

export interface Guide {
  id: string;
  title: string;
  steps: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'add-device',
    title: 'Přidat zařízení / klimatizaci',
    steps: [
      'Dole klikni na **Kartotéka**.',
      'Nahoře zmáčkni **＋ Přidat** a vyber **Zařízení**.',
      'Do názvu napiš, co to je — třeba **„Klimatizace velín"** nebo **„Čerpadlo 1"**.',
      'Vyber, kam patří (budova / místnost), a klikni **Vytvořit**.',
      'Hotovo ✅. Klimatizaci pak najdeš ve **Vzduchotechnika → Klimatizace** a dáš jí **„Nastavit údržbu"** — appka pak hlídá termíny za tebe.',
    ],
  },
  {
    id: 'add-building-room',
    title: 'Přidat budovu a místnost',
    steps: [
      'Otevři **Kartotéka**.',
      'Zmáčkni **＋ Přidat → Budova**. Napiš název (např. **„Hala D"**) a **Vytvořit**.',
      'U té budovy klikni na **＋** (přidat dovnitř) a vyber **Místnost**.',
      'Napiš název místnosti (např. **„Kotelna"**) a **Vytvořit**.',
      'Hotovo ✅. Teď můžeš do místnosti přidávat **Zařízení**.',
    ],
  },
  {
    id: 'add-line',
    title: 'Přidat výrobní linku',
    steps: [
      'Dole klikni **Stroje**, nahoře přepni na **Výrobní linky**.',
      'Zmáčkni **＋ Přidat linku**.',
      'Napiš název (např. **„Linka 1"**) a kde stojí.',
      'Ulož. Pak k lince **přiřaď stroje**, které k ní patří.',
      'Hotovo ✅. Stav linky (zelená/oranžová/červená) se spočítá z jejích strojů.',
    ],
  },
  {
    id: 'log-work',
    title: 'Zapsat provedenou práci',
    steps: [
      'Otevři kontrolu — **Přehled → Kalibrace** (nebo Sklo, Detektory, Klimatizace).',
      'U položky klikni na **✓ / hotovo**.',
      'Napiš, **co bylo uděláno** (např. odchylka, číslo certifikátu). Kdo a datum jsou předvyplněné.',
      'Klikni **Zapsat práci**.',
      'Hotovo ✅. Záznam je v **Deníku** a termín se posune sám. Auditor to uvidí.',
    ],
  },
  {
    id: 'add-inspection',
    title: 'Přidat kontrolu / obchůzku',
    steps: [
      'Otevři **Kartotéka**.',
      'Zmáčkni **＋ Přidat → Kontrola**.',
      'Vyber budovu nebo místnost, které se kontrola týká.',
      'Napiš, co se kontroluje, a **Vytvořit**.',
      'Hotovo ✅. Kontroly pak najdeš v sekci **Kontroly**.',
    ],
  },
];

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id);

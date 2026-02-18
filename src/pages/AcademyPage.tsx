// src/pages/AcademyPage.tsx
// VIKRR — Asset Shield — Academy (Offline Knowledge Base)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, BookOpen, Cpu, Sparkles, Shield } from 'lucide-react';
import appConfig from '../appConfig';

// ═══════════════════════════════════════════════════════════════════
// LOCAL CONTENT — all text stored in-code (zero external fetching)
// ═══════════════════════════════════════════════════════════════════

interface AccordionItem {
  title: string;
  content: string;
}

interface AcademySection {
  id: string;
  icon: typeof BookOpen;
  label: string;
  color: string;
  borderColor: string;
  items: AccordionItem[];
}

const SECTIONS: AcademySection[] = [
  // ──────────────────────────────────────────────
  // SECTION 1: USER GUIDE
  // ──────────────────────────────────────────────
  {
    id: 'guide',
    icon: BookOpen,
    label: 'Uživatelská příručka',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    items: [
      {
        title: 'Jak nahlásit poruchu?',
        content: `1. Na hlavní obrazovce klepněte na dlaždici „Nahlásit poruchu" (🚨).
2. Vyplňte název poruchy — stručně popište, co se stalo.
3. Volitelně přidejte podrobný popis závady (zvuky, vibrace, kdy to začalo).
4. Vyberte závažnost:
   • 🔴 Vysoká (P1) — havárie, okamžitý zásah
   • 🟡 Střední (P2) — urgentní, řešit do týdne
   • 🟢 Nízká (P3) — běžná údržba
5. Klepněte na „Nahlásit poruchu" — systém vytvoří pracovní příkaz.

Tip: Hlášení funguje i offline. Odešle se automaticky po obnovení připojení.`,
      },
      {
        title: 'Jak objednat díl nebo materiál?',
        content: `1. Klepněte na dlaždici „Požadavky" (🔧).
2. Vyberte typ požadavku:
   • 🔧 Chybí nářadí
   • 👕 Chybí pracovní oděv
   • 📦 Chybí materiál
3. Popište co přesně potřebujete.
4. V poli „Upřesnění objednávky" uveďte přesné rozměry, typ nebo katalogové číslo.
   Příklad: „Ložisko 6204-2RS, SKF, 20×47×14 mm"
5. Odešlete — vedení obdrží notifikaci.`,
      },
      {
        title: 'Jak používat nástěnku?',
        content: `Nástěnka (📌) slouží k týmové komunikaci.

Čtení zpráv:
• Otevřete dlaždici „Nástěnka" na hlavní obrazovce.
• Zprávy jsou seřazeny podle priority — připnuté nahoře.
• Barevné štítky: 🔴 Důležité, 🔵 Běžné, ⚪ Info.

Vytvoření zprávy (pouze admin):
1. Klepněte na „Přidat" v pravém horním rohu.
2. Vyplňte nadpis a text zprávy.
3. Vyberte prioritu.
4. Klepněte na „Publikovat".

Připnutí zprávy (pouze admin):
• Klepněte na ikonu špendlíku (📌) vedle zprávy.`,
      },
      {
        title: 'Jak podat nápad na zlepšení?',
        content: `1. Klepněte na dlaždici „Nápad" (💡).
2. Vyberte režim:
   • 🔒 Anonymně — nikdo neuvidí vaše jméno.
   • 👤 Se jménem — váš nápad bude sledovatelný (body za aktivitu).
3. Pokud jste zvolili „Se jménem", vyplňte jméno a volitelně PIN.
4. Popište svůj nápad — co byste chtěli zlepšit.
5. Odešlete — systém vytvoří úkol typu „Zlepšení" pro vedení.

Každý podaný nápad se jménem se zaznamenává do systému zapojení zaměstnanců.`,
      },
      {
        title: 'Jak funguje schránka důvěry?',
        content: `Schránka důvěry (Trustbox) je plně anonymní kanál pro komunikaci s vedením.

1. Klepněte na dlaždici „Trustbox" na hlavní obrazovce.
2. Napište svou zprávu — žádné osobní údaje se neukládají.
3. Odešlete — zpráva dorazí vedení bez jakékoliv identifikace.

Technické zabezpečení:
• Zpráva se ukládá bez ID uživatele, bez timestampu odeslání.
• Vedení vidí pouze text zprávy — nikdy ne kdo ji poslal.
• Architektura „černé díry" — ani administrátor nemůže zpětně identifikovat odesílatele.`,
      },
      {
        title: 'Jak upravit rozvržení hlavní obrazovky?',
        content: `1. Klepněte na tlačítko „Upravit" (✏️) v pravém horním rohu.
2. Dlaždice se začnou chvět — jste v režimu úprav.
3. Možnosti:
   • ✖ Skrýt dlaždici — klepněte na křížek.
   • ◀▶ Přesunout — klepněte na šipky.
   • Knihovna — skryté dlaždice najdete dole, klepnutím je vrátíte.
4. Klepněte na „Hotovo" pro uložení.

Rozvržení se ukládá do paměti vašeho prohlížeče a zůstane i po zavření.`,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // SECTION 2: TECH LOGIC
  // ──────────────────────────────────────────────
  {
    id: 'tech',
    icon: Cpu,
    label: 'Pod kapotou',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    items: [
      {
        title: 'Firestore Data Flow — Jak tečou data?',
        content: `VIKRR Asset Shield využívá Google Cloud Firestore jako hlavní databázi s real-time synchronizací.

Princip toku dat:
1. Uživatel provede akci (např. nahlásí poruchu).
2. Servisní vrstva (taskService) zapíše dokument do Firestore.
3. onSnapshot listener na všech připojených klientech okamžitě obdrží změnu.
4. React state se aktualizuje → UI se překreslí.

Klíčové vlastnosti:
• Real-time sync — změny se projeví na všech zařízeních do 1–2 sekund.
• Offline persistence — IndexedDB ukládá kopii dat lokálně.
• Optimistické zápisy — UI se aktualizuje ihned, i bez serveru.
• Automatická rekonekce — po výpadku se data dosynchronizují.`,
      },
      {
        title: 'Offline-first — Jak funguje bez internetu?',
        content: `Aplikace je navržena pro prostředí výrobní haly, kde může být nestabilní Wi-Fi.

Technologie:
• Firestore IndexedDB Persistence — automaticky zapnuta při startu.
• Service Worker — cachuje statické soubory (JS, CSS, ikony).
• LocalStorage — ukládá uživatelské preference (rozvržení dlaždic, filtry).

Co funguje offline:
✅ Prohlížení všech dat (stroje, úkoly, sklady, revize)
✅ Nahlášení poruchy (odešle se po reconectu)
✅ Prohlížení mapy areálu
✅ Čtení nástěnky
✅ Kontroly budov (inspekce)

Co vyžaduje připojení:
⚠️ Přihlášení (PIN ověření přes Firebase Auth)
⚠️ Nahrávání fotografií
⚠️ AI asistent`,
      },
      {
        title: 'Inspection Memory — Paměť kontrol',
        content: `Systém kontrol budov má unikátní mechanismus „paměti", který zajistí, že žádná závada nezůstane zapomenutá.

5 klíčových bodů Inspection Memory:

1. MĚSÍČNÍ SNAPSHOT
   Každý měsíc se vytvoří nová sada kontrolních bodů z šablon. Kontrolér prochází budovu a značí body jako „OK" nebo „Závada".

2. AUTOMATICKÁ DETEKCE NEDODĚLKŮ
   Při otevření nového měsíce systém automaticky načte všechny nevyřešené závady z předchozího měsíce (status='defect' + bez resolution).

3. CARRY-OVER DIALOG
   Kontrolér vidí sekci „Nedodělky z minula" se dvěma možnostmi:
   • „Opraveno" → závada se označí jako vyřešená.
   • „Stále závada" → spustí se carry-over mechanismus.

4. ŘETĚZENÍ ZÁVAD
   Při carry-over se vytvoří nový záznam v aktuálním měsíci s prefixem [Nedodělek], odkazem na původní závadu (previousDefectId) a automaticky se vygeneruje P1 pracovní příkaz pro údržbu.

5. AUDIT TRAIL
   Každá přenesená závada nese kompletní historii — kdo ji našel, kdy, kolikrát byla přenesena. Originální záznam se označí jako 'carried_over' s odkazem na cílový měsíc.`,
      },
      {
        title: 'Cloud Functions — Mozek na serveru',
        content: `Na pozadí běží serverová funkce (Cloud Function), která automaticky přepočítává statistiky.

Trigger: Jakákoliv změna v kolekci 'tasks' (vytvoření, update, smazání).

Co počítá:
• MTTR (Prům. doba opravy) — průměrný čas od nahlášení do uzavření nápravného úkolu.
• MTBF (Doba bez poruchy) — průměrný čas mezi P1 poruchami u každého stroje.
• Distribuce typů práce — kolik úkolů bylo Údržba, Revize, Sanitace atd.
• Lemon List — Top 5 nejproblematičtějších strojů za posledních 30 dní.
• Celkové náklady — suma nákladů na náhradní díly a pracovní hodiny.

Výsledky se zapisují do kolekce 'stats_aggregates/global' a 'stats_aggregates/by_asset/{assetId}/stats'.`,
      },
      {
        title: 'Role-Based Access Control (RBAC)',
        content: `Systém rozlišuje 6 uživatelských rolí s 40+ granulárními oprávněními.

Hierarchie rolí:
• SUPERADMIN — plný přístup + hard delete + systémové nastavení.
• MAJITEL — plný přístup k datům a funkcím.
• VEDENI — management, čtení všeho, zápis většiny oblastí.
• UDRZBA — technik údržby, stroje, úkoly, díly, vozidla.
• VYROBA — technik výroby, stroje, úkoly, díly.
• OPERATOR — kiosk mode, hlášení poruch, předfiltry, schránka důvěry.

Oprávnění se kontrolují na dvou úrovních:
1. Klient (React) — hasPermission() skrývá/zobrazuje UI prvky.
2. Server (Firestore Rules) — isManagement(), isTechnician() blokují neautorizované zápisy.`,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // SECTION 3: AI LEGACY
  // ──────────────────────────────────────────────
  {
    id: 'ai',
    icon: Sparkles,
    label: 'AI Legacy — Příběh vzniku',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/30',
    items: [
      {
        title: 'Jak vznikl VIKRR Asset Shield?',
        content: `VIKRR Asset Shield je výsledek unikální spolupráce mezi člověkem a umělou inteligencí.

Vilém „Vilda" Krejčí — zakladatel a produktový architekt — navrhl vizi moderního CMMS systému pro potravinářský průmysl. Místo tradičního vývoje se rozhodl pro průkopnický přístup: celou aplikaci postavil v dialogu s AI asistentem Claude (Anthropic).

Tento proces se nazývá „Prompt Engineering" — umění formulovat přesné instrukce tak, aby AI vygenerovala funkční, kvalitní kód. Vilda definoval:
• Architekturu systému (React + Firebase + Tailwind)
• Datové modely (30+ Firestore kolekcí)
• Business logiku (MTBF, MTTR, Lemon List, Inspection Memory)
• UX principy (dark theme, mobile-first, offline-first)

Claude pak napsal kód — stránku po stránce, funkci po funkci — v iterativním dialogu, kde každá odpověď byla testována, upravena a vylepšena.`,
      },
      {
        title: 'Co je Prompt Engineering?',
        content: `Prompt Engineering je disciplína, kde člověk komunikuje s AI modelem pomocí přesně formulovaných instrukcí (promptů).

Klíčové principy použité při tvorbě VIKRR:

1. KONTEXT (@CONTEXT)
   Každý prompt začínal kontextem: technologie, brand, cíl.
   Příklad: „@CONTEXT: React, Firebase. @BRAND: VIKRR Asset Shield."

2. STRUKTUROVANÉ ÚKOLY
   Požadavky byly rozděleny do jasných, pojmenovaných tasků.
   Příklad: „TASK 1: IDEAS MODULE — Anonymous/Identified submission."

3. TECHNICKÉ MANTINELY
   Specifikace frameworku, stylů, konvencí.
   Příklad: „@TECHNICAL: Use z-[9999] for modals. Optimize for iPhone 17."

4. ITERATIVNÍ ZPŘESŇOVÁNÍ
   Po každém výstupu Vilda testoval, kontroloval a promptem upřesnil.
   Příklad: „@URGENT: REMOVE 'Krejčí' from the product name."

5. COMPLIANCE DIREKTIVY
   Pravidla pro kvalitu: „All UI in Czech. Code identifiers in English."`,
      },
      {
        title: 'Technický stack — proč právě tyto technologie?',
        content: `Výběr technologií nebyl náhodný. Každá komponenta řeší konkrétní potřebu potravinářského provozu:

React 19 — Nejrozšířenější UI framework. Obrovský ekosystém, snadná údržba.

TypeScript 5.9 — Typová bezpečnost. Chyby se odchytí při kompilaci, ne v provozu.

Vite 7 — Bleskový build. Hot Module Replacement pro okamžitý development.

Tailwind CSS v4 — Utility-first styling. Dark theme, responsive, konzistentní design.

Firebase — Serverless backend od Google:
  • Auth — PIN přihlášení bez vlastního serveru.
  • Firestore — Real-time databáze s offline persistencí.
  • Storage — Fotky, dokumenty, revizní zprávy.
  • Hosting — CDN distribuce, HTTPS, custom doména.
  • Cloud Functions — Serverová logika (statistiky, agregace).

Tato kombinace umožnila vytvořit plnohodnotný enterprise CMMS systém bez jediného vlastního serveru.`,
      },
      {
        title: 'Čísla projektu',
        content: `VIKRR Asset Shield v číslech:

📄 16+ stránek (route-level komponent)
📦 30+ Firestore kolekcí
🔐 6 uživatelských rolí, 40+ oprávnění
🏭 6 budov (A–E, L) s hierarchií místností
📊 Real-time statistiky (MTBF, MTTR, Lemon List)
🔍 Inspekční systém s carry-over pamětí
🚗 Správa vozového parku
♻️ Odpadové hospodářství
🌾 Modul loupárny (sila, výroba, plevy)
📌 Týmová nástěnka
💡 Systém nápadů s engagement trackingem
🔒 Anonymní schránka důvěry
🤖 AI asistent (připraveno pro Gemini API)
📱 Kiosk mode pro operátory
🌐 Offline-first architektura

Celý systém vznikl metodou Prompt Engineering — důkaz, že budoucnost vývoje software je v symbióze člověka a AI.`,
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// ACCORDION COMPONENT
// ═══════════════════════════════════════════════════════════════════

function Accordion({ item, isOpen, onToggle }: {
  item: AccordionItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3.5 px-1 text-left group"
      >
        <span className={`text-[14px] font-medium transition ${isOpen ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
          {item.title}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 flex-shrink-0 ml-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-orange-400' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="pb-4 px-1">
          <div className="text-[13px] text-slate-400 leading-relaxed whitespace-pre-line">
            {item.content}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

export default function AcademyPage() {
  const navigate = useNavigate();
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleItem = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalItems = SECTIONS.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            {appConfig.BRAND_NAME} Academy
          </h1>
          <p className="text-xs text-slate-500">{totalItems} článků — vše offline</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Section selector */}
        {!activeSection && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-4">
              Kompletní znalostní báze {appConfig.PRODUCT_NAME}. Veškerý obsah je uložen lokálně — funguje bez internetu.
            </p>
            {SECTIONS.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-800/60 border ${section.borderColor} hover:bg-slate-800/80 transition active:scale-[0.98]`}
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-6 h-6 ${section.color}`} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-[15px] font-semibold text-white">{section.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{section.items.length} článků</div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-slate-600 -rotate-90" />
                </button>
              );
            })}

            {/* Version footer */}
            <div className="text-center pt-6 text-[11px] text-slate-600 space-y-1">
              <div>{appConfig.PRODUCT_NAME} {appConfig.VERSION}</div>
              <div>{appConfig.COPYRIGHT}</div>
              <div className="text-slate-700">Built with Claude AI + Prompt Engineering</div>
            </div>
          </div>
        )}

        {/* Section content */}
        {activeSection && (() => {
          const section = SECTIONS.find(s => s.id === activeSection);
          if (!section) return null;
          const Icon = section.icon;
          return (
            <div>
              {/* Section header */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Zpět na přehled
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${section.color}`} />
                </div>
                <h2 className="text-lg font-bold text-white">{section.label}</h2>
              </div>

              {/* Accordion items */}
              <div className="bg-slate-800/40 rounded-2xl border border-slate-700/30 px-4 divide-y divide-transparent">
                {section.items.map((item, idx) => {
                  const key = `${section.id}-${idx}`;
                  return (
                    <Accordion
                      key={key}
                      item={item}
                      isOpen={openItems.has(key)}
                      onToggle={() => toggleItem(key)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

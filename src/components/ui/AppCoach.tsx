import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, ChevronRight, HelpCircle, NotebookPen, Package, Search, X } from 'lucide-react';

type CoachAction = {
  label: string;
  path: string;
};

type CoachContent = {
  title: string;
  lead: string;
  points: string[];
  actions: CoachAction[];
};

function getCoachContent(pathname: string): CoachContent {
  if (pathname.startsWith('/kartoteka')) {
    return {
      title: 'Kartoteka',
      lead: 'Tady je strom firmy: budovy, místnosti, stroje a převodovky.',
      points: [
        'Klikni na řádek a rozbalíš, co je uvnitř.',
        'Historie karty má ukázat, co se na místě nebo stroji dělalo.',
        'Nové zařízení vždy přiřaď pod budovu, místnost nebo jiný stroj.',
      ],
      actions: [
        { label: 'Úkoly', path: '/tasks' },
        { label: 'Deník', path: '/work-diary' },
        { label: 'Reporty', path: '/reports' },
      ],
    };
  }

  if (pathname.startsWith('/asset/')) {
    return {
      title: 'Karta zařízení',
      lead: 'Jedna karta má být rodný list stroje, místnosti nebo převodovky.',
      points: [
        'Nejdůležitější je historie: opravy, kontroly, teploty a úkoly.',
        'Z karty má jít rychle založit úkol nebo zápis do deníku.',
        'U převodovky sleduj umístění, servis a teplotní záznamy.',
      ],
      actions: [
        { label: 'Kartotéka', path: '/kartoteka' },
        { label: 'Nový zápis', path: '/work-diary?new=1' },
        { label: 'Reporty', path: '/reports' },
      ],
    };
  }

  if (pathname.startsWith('/tasks')) {
    return {
      title: 'Úkolníček',
      lead: 'Sem patří závady, práce pro údržbu a úkoly vzniklé z kontrol.',
      points: [
        'Každý úkol má mít zařízení, termín, prioritu a pracovníky.',
        'Po dokončení se má udělat stopa do historie a deníku.',
        'Pro audit je důležité kdo, kdy a co provedl.',
      ],
      actions: [
        { label: 'Deník', path: '/work-diary' },
        { label: 'Kontroly', path: '/inspections' },
        { label: 'Upozornění', path: '/notifications' },
      ],
    };
  }

  if (pathname.startsWith('/inspections') || pathname.startsWith('/inspection')) {
    return {
      title: 'Kontroly',
      lead: 'Tady se mají plánovat denní, týdenní a měsíční kontroly.',
      points: [
        'Plán kontroly má jít nastavit uživatelsky, ne natvrdo v kódu.',
        'Kontrola může obsahovat více místností i více zařízení.',
        'Závada z kontroly má jít převést na úkol.',
      ],
      actions: [
        { label: 'Kartotéka', path: '/kartoteka' },
        { label: 'Úkoly', path: '/tasks' },
        { label: 'Reporty', path: '/reports' },
      ],
    };
  }

  if (pathname.startsWith('/work-diary')) {
    return {
      title: 'Deník údržby',
      lead: 'Deník je důkaz práce: co se dělalo, kde, kdy a kdo to provedl.',
      points: [
        'Při dopisování zvol skutečné datum provedení práce.',
        'Zařízení a místo vybírej z kartotéky, aby šly dělat reporty.',
        'Zápis má být dohledatelný v kartě zařízení i v reportech.',
      ],
      actions: [
        { label: 'Kartotéka', path: '/kartoteka' },
        { label: 'Reporty', path: '/reports' },
        { label: 'Úkoly', path: '/tasks' },
      ],
    };
  }

  if (pathname.startsWith('/reports')) {
    return {
      title: 'Reporty',
      lead: 'Report má rychle odpovědět vedení nebo auditu, co se kdy dělalo.',
      points: [
        'Nejdřív vyber období a konkrétní zařízení nebo skupinu.',
        'Pro převodovky filtruj převodovku, extruder a poslední čtvrtletí.',
        'Souhrnné grafy jsou vedlejší, důležitý je seznam prací a export.',
      ],
      actions: [
        { label: 'Deník', path: '/work-diary' },
        { label: 'Kartotéka', path: '/kartoteka' },
        { label: 'Upozornění', path: '/notifications' },
      ],
    };
  }

  if (pathname.startsWith('/notifications')) {
    return {
      title: 'Upozornění',
      lead: 'Tady má údržba vidět, co hoří nebo se blíží.',
      points: [
        'Po splnění úkolu nebo kontrole by upozornění mělo zmizet.',
        'Priorita je po termínu, P1 úkoly a rizikové teploty převodovek.',
        'Upozornění má být zkratka k detailu, ne další seznam navíc.',
      ],
      actions: [
        { label: 'Úkoly', path: '/tasks' },
        { label: 'Kontroly', path: '/inspections' },
        { label: 'Reporty', path: '/reports' },
      ],
    };
  }

  if (pathname.startsWith('/inventory') || pathname.startsWith('/warehouse')) {
    return {
      title: 'Sklad ND',
      lead: 'Sklad má ukázat díly, které jsou fyzicky dostupné nebo navázané na stroje.',
      points: [
        'Převodovka ve skladu má mít odkaz na svoji kartu.',
        'U důležitých dílů sleduj, kde jsou právě namontované.',
        'Pohyby mají zůstat v historii kvůli dohledatelnosti.',
      ],
      actions: [
        { label: 'Kartotéka', path: '/kartoteka' },
        { label: 'Reporty', path: '/reports' },
        { label: 'Úkoly', path: '/tasks' },
      ],
    };
  }

  return {
    title: 'Dashboard',
    lead: 'Hlavní stránka má rychle ukázat, co dnes řešit.',
    points: [
      'Začni upozorněním, úkoly po termínu a dnešními kontrolami.',
      'Kartotéka je zdroj strojů, místností a převodovek.',
      'Deník a reporty jsou hlavní podklad pro audit.',
    ],
    actions: [
      { label: 'Kartotéka', path: '/kartoteka' },
      { label: 'Úkoly', path: '/tasks' },
      { label: 'Kontroly', path: '/inspections' },
      { label: 'Reporty', path: '/reports' },
    ],
  };
}

export default function AppCoach() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const content = useMemo(() => getCoachContent(location.pathname), [location.pathname]);

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden sm:bottom-5 sm:right-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-blue-400/40 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-blue-100 shadow-2xl shadow-slate-950/40 backdrop-blur hover:border-blue-300 hover:bg-slate-900"
          aria-label="Otevřít rychlou nápovědu"
        >
          <HelpCircle className="h-5 w-5 text-blue-300" />
          <span className="hidden sm:inline">Nápověda</span>
        </button>
      ) : (
        <section className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-700 bg-slate-950/95 p-4 text-slate-100 shadow-2xl shadow-slate-950/50 backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Rychlá orientace</p>
              <h2 className="mt-1 text-lg font-bold text-white">{content.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Zavřít rychlou nápovědu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm leading-6 text-slate-300">{content.lead}</p>

          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {content.points.map((point) => (
              <li key={point} className="flex gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 flex-none text-blue-300" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {content.actions.map((action) => (
              <button
                key={`${action.path}-${action.label}`}
                type="button"
                onClick={() => {
                  navigate(action.path);
                  setOpen(false);
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm font-semibold text-slate-100 hover:border-blue-400 hover:bg-slate-800"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
            <Search className="h-4 w-4 text-slate-500" />
            <NotebookPen className="h-4 w-4 text-slate-500" />
            <Package className="h-4 w-4 text-slate-500" />
            <Bell className="h-4 w-4 text-slate-500" />
            <BarChart3 className="h-4 w-4 text-slate-500" />
            <span className="ml-auto">pomoc podle obrazovky</span>
          </div>
        </section>
      )}
    </div>
  );
}

// src/pages/SettingsPage.tsx
// Nominal CMMS — Module-specific settings (Nastavení)

import { useState } from 'react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import {
  ArrowLeft, Settings2, Package, Factory, Truck,
  ClipboardCheck, BarChart3, Users,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════
// SETTINGS TAB DEFINITIONS
// ═══════════════════════════════════════════════════════

interface SettingsTab {
  id: string;
  label: string;
  icon: typeof Settings2;
  color: string;
  module: string; // maps to MODULE_DEFINITIONS.id
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: 'Obecné', icon: Settings2, color: 'text-slate-400', module: '' },
  { id: 'warehouse', label: 'Sklad výroby', icon: Package, color: 'text-slate-400', module: 'warehouse' },
  { id: 'production', label: 'Výroba', icon: Factory, color: 'text-slate-400', module: 'production' },
  { id: 'fleet', label: 'Vozidla', icon: Truck, color: 'text-slate-400', module: 'fleet' },
  { id: 'inspections', label: 'Kontroly', icon: ClipboardCheck, color: 'text-slate-400', module: 'inspections' },
  { id: 'reports', label: 'Reporty', icon: BarChart3, color: 'text-slate-400', module: 'reports' },
  { id: 'shifts', label: 'Směny', icon: Users, color: 'text-slate-400', module: 'shifts' },
];

// ═══════════════════════════════════════════════════════
// SETTINGS CONTENT COMPONENTS
// ═══════════════════════════════════════════════════════

function SettingsCard({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {!children && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase tracking-wide">
            Připravujeme
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      {children || (
        <div className="text-xs text-slate-400 py-3 px-3 text-center border border-dashed border-slate-200 rounded-xl bg-[#fbf9f4]">
          Tuto konfiguraci dokončujeme — brzy půjde nastavit přímo tady.
        </div>
      )}
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Jazyk" description="Výchozí jazyk systému">
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl font-medium">Čeština</button>
          <button className="px-4 py-2 bg-white text-slate-400 text-sm rounded-xl border border-slate-200" disabled>English</button>
        </div>
      </SettingsCard>
      <SettingsCard title="Časová zóna" description="Časová zóna pro plánování a logy">
        <div className="px-3 py-2 bg-[#fbf9f4] border border-slate-200 rounded-lg text-slate-900 text-sm">
          Europe/Prague (CET/CEST)
        </div>
      </SettingsCard>
      <SettingsCard title="Formát data" description="Formát zobrazení datumů v celém systému">
        <div className="px-3 py-2 bg-[#fbf9f4] border border-slate-200 rounded-lg text-slate-900 text-sm">
          DD.MM.YYYY (český formát)
        </div>
      </SettingsCard>
    </div>
  );
}

function WarehouseSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Kategorie materiálu" description="Typy materiálu pro příjem a evidenci">
        <div className="flex flex-wrap gap-2">
          {['Surovina', 'Polotovar', 'Hotový výrobek', 'Obal'].map(cat => (
            <span key={cat} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 font-medium">{cat}</span>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Upozornění na nízký stav" description="Práh pro automatické upozornění při nízkých zásobách" />
      <SettingsCard title="Dodavatelé" description="Seznam schválených dodavatelů pro příjem materiálu" />
    </div>
  );
}

function ProductionSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Extrudéry" description="Konfigurace výrobních linek">
        <div className="flex flex-wrap gap-2">
          {['E1 — Extrudér 1', 'E2 — Extrudér 2', 'E3 — Extrudér 3'].map(m => (
            <span key={m} className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-200 font-medium">{m}</span>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Balicí linky" description="Konfigurace balicích linek" />
      <SettingsCard title="Směnový režim" description="Nastavení směn pro výrobu (ranní, odpolední, noční)" />
    </div>
  );
}

function FleetSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Intervaly servisu" description="Automatické upozornění na servis podle km/mth" />
      <SettingsCard title="Kategorie vozidel" description="Typy vozidel ve vozovém parku" />
    </div>
  );
}

function InspectionSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Kontrolní šablony" description="Šablony pro pravidelné kontroly budov" />
      <SettingsCard title="Carry-over pravidla" description="Automatické přenášení nedodělků do dalšího měsíce" />
    </div>
  );
}

function ReportSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Automatické reporty" description="Nastavení pravidelných emailových reportů" />
      <SettingsCard title="KPI prahy" description="Cílové hodnoty pro MTBF, MTTR a další metriky" />
    </div>
  );
}

function ShiftSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Typy směn" description="Definice směnového režimu">
        <div className="flex flex-wrap gap-2">
          {['R — Ranní (6:00–14:00)', 'O — Odpolední (14:00–22:00)', 'N — Noční (22:00–6:00)'].map(s => (
            <span key={s} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs rounded-lg border border-indigo-200 font-medium">{s}</span>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Minimální obsazení" description="Požadovaný počet techniků na směnu" />
    </div>
  );
}

const TAB_CONTENT: Record<string, () => React.ReactElement> = {
  general: GeneralSettings,
  warehouse: WarehouseSettings,
  production: ProductionSettings,
  fleet: FleetSettings,
  inspections: InspectionSettings,
  reports: ReportSettings,
  shifts: ShiftSettings,
};

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function SettingsPage() {
  const goBack = useBackNavigation('/');
  const { hasPermission } = useAuthContext();
  const [activeTab, setActiveTab] = useState('general');

  const canView = hasPermission('admin.view') || hasPermission('admin.manage');

  if (!canView) {
    return (
      <div className="min-h-screen bg-[#f1ece3] flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-md">
          <Settings2 className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Přístup odepřen</h2>
          <p className="text-slate-500 mb-4">Nemáte oprávnění k nastavení</p>
          <button onClick={() => goBack()} className="px-6 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200">Zpět</button>
        </div>
      </div>
    );
  }

  const ContentComponent = TAB_CONTENT[activeTab] || GeneralSettings;

  return (
    <div className="min-h-screen bg-[#f1ece3] pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => goBack()} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Nastavení</h1>
            <p className="text-xs text-slate-500">Konfigurace modulů systému</p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition flex-shrink-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div key={activeTab} className="max-w-2xl mx-auto px-4 py-4 vik-fade-in">
        <ContentComponent />
      </div>
    </div>
  );
}

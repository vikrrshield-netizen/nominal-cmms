// src/pages/SettingsPage.tsx
// Nominal CMMS — Module-specific settings (Nastavení)

import { useState, useEffect } from 'react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import {
  ArrowLeft, Settings2, Package, Factory, Truck,
  ClipboardCheck, BarChart3, Users,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { useTenantSettings } from '../hooks/useTenantSettings';
import { showToast } from '../components/ui/Toast';
import type { TenantModuleConfig } from '../types/tenant';

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

interface SectionProps {
  cfg: TenantModuleConfig;
  canManage: boolean;
  save: (patch: TenantModuleConfig) => Promise<void>;
}

// ═══════════════════════════════════════════════════════
// SETTINGS CONTENT COMPONENTS
// ═══════════════════════════════════════════════════════

/** Placeholder karta pro konfiguraci, kterou teprve dokončujeme. */
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

/** Funkční číselné nastavení — uloží hodnotu do tenant_settings.moduleConfig. */
function NumberSetting({
  title, description, value, unit, placeholder, disabled, onSave,
}: {
  title: string;
  description: string;
  value: number | undefined;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  onSave: (val: number) => Promise<void>;
}) {
  const [raw, setRaw] = useState(value != null ? String(value) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRaw(value != null ? String(value) : ''); }, [value]);

  const trimmed = raw.trim();
  const parsed = trimmed === '' ? undefined : Number(trimmed);
  const invalid = trimmed !== '' && (Number.isNaN(parsed) || (parsed as number) < 0);
  const canSave = !disabled && !saving && !invalid && parsed !== undefined && parsed !== value;

  const handleSave = async () => {
    if (!canSave || parsed === undefined) return;
    setSaving(true);
    try {
      await onSave(parsed);
      showToast('Nastavení uloženo', 'success');
    } catch {
      showToast('Uložení se nezdařilo', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={raw}
            placeholder={placeholder}
            disabled={disabled || saving}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            className="w-full px-3 py-2 bg-[#fbf9f4] border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-emerald-400 disabled:opacity-60"
          />
          {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {saving ? 'Ukládám…' : 'Uložit'}
        </button>
      </div>
      {invalid && <p className="text-xs text-red-600 mt-1.5">Zadej nezáporné číslo.</p>}
      {!disabled && value != null && !invalid && parsed === value && (
        <p className="text-xs text-emerald-700 mt-1.5">Uloženo: {value}{unit ? ` ${unit}` : ''}</p>
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

function WarehouseSettings({ cfg, canManage, save }: SectionProps) {
  return (
    <div className="space-y-4">
      <SettingsCard title="Kategorie materiálu" description="Typy materiálu pro příjem a evidenci">
        <div className="flex flex-wrap gap-2">
          {['Surovina', 'Polotovar', 'Hotový výrobek', 'Obal'].map(cat => (
            <span key={cat} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 font-medium">{cat}</span>
          ))}
        </div>
      </SettingsCard>
      <NumberSetting
        title="Upozornění na nízký stav"
        description="Práh pro automatické upozornění při nízkých zásobách (v základních jednotkách)."
        value={cfg.warehouse?.lowStockThreshold}
        unit="ks"
        placeholder="např. 10"
        disabled={!canManage}
        onSave={(v) => save({ warehouse: { lowStockThreshold: v } })}
      />
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

function FleetSettings({ cfg, canManage, save }: SectionProps) {
  return (
    <div className="space-y-4">
      <NumberSetting
        title="Interval servisu"
        description="Po kolika kilometrech upozornit na servis vozidla."
        value={cfg.fleet?.serviceIntervalKm}
        unit="km"
        placeholder="např. 15000"
        disabled={!canManage}
        onSave={(v) => save({ fleet: { serviceIntervalKm: v } })}
      />
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

function ReportSettings({ cfg, canManage, save }: SectionProps) {
  return (
    <div className="space-y-4">
      <SettingsCard title="Automatické reporty" description="Nastavení pravidelných emailových reportů" />
      <NumberSetting
        title="Cíl MTBF"
        description="Cílová střední doba mezi poruchami (Mean Time Between Failures)."
        value={cfg.reports?.mtbfTargetHours}
        unit="h"
        placeholder="např. 720"
        disabled={!canManage}
        onSave={(v) => save({ reports: { mtbfTargetHours: v } })}
      />
      <NumberSetting
        title="Cíl MTTR"
        description="Cílová střední doba opravy (Mean Time To Repair)."
        value={cfg.reports?.mttrTargetHours}
        unit="h"
        placeholder="např. 4"
        disabled={!canManage}
        onSave={(v) => save({ reports: { mttrTargetHours: v } })}
      />
    </div>
  );
}

function ShiftSettings({ cfg, canManage, save }: SectionProps) {
  return (
    <div className="space-y-4">
      <SettingsCard title="Typy směn" description="Definice směnového režimu">
        <div className="flex flex-wrap gap-2">
          {['R — Ranní (6:00–14:00)', 'O — Odpolední (14:00–22:00)', 'N — Noční (22:00–6:00)'].map(s => (
            <span key={s} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs rounded-lg border border-indigo-200 font-medium">{s}</span>
          ))}
        </div>
      </SettingsCard>
      <NumberSetting
        title="Minimální obsazení"
        description="Požadovaný počet techniků na jednu směnu."
        value={cfg.shifts?.minStaffing}
        unit="os."
        placeholder="např. 2"
        disabled={!canManage}
        onSave={(v) => save({ shifts: { minStaffing: v } })}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function SettingsPage() {
  const goBack = useBackNavigation('/');
  const { hasPermission, user } = useAuthContext();
  const { tenants, updateModuleConfig } = useTenantSettings();
  const [activeTab, setActiveTab] = useState('general');

  const canView = hasPermission('admin.view') || hasPermission('admin.manage');
  const canManage = hasPermission('admin.manage');

  const tenant = tenants.find((t) => t.id === user?.tenantId) ?? tenants[0];
  const cfg: TenantModuleConfig = tenant?.moduleConfig ?? {};

  const save = async (patch: TenantModuleConfig) => {
    if (!tenant) throw new Error('Tenant není dostupný');
    await updateModuleConfig(tenant.id, patch, user?.displayName || 'Neznámý', tenant.name);
  };

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

  const sectionProps: SectionProps = { cfg, canManage, save };

  const renderContent = () => {
    switch (activeTab) {
      case 'warehouse': return <WarehouseSettings {...sectionProps} />;
      case 'production': return <ProductionSettings />;
      case 'fleet': return <FleetSettings {...sectionProps} />;
      case 'inspections': return <InspectionSettings />;
      case 'reports': return <ReportSettings {...sectionProps} />;
      case 'shifts': return <ShiftSettings {...sectionProps} />;
      default: return <GeneralSettings />;
    }
  };

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

      {/* Read-only upozornění */}
      {!canManage && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Máš jen náhled. Pro úpravy nastavení potřebuješ oprávnění správy (admin.manage).
          </div>
        </div>
      )}

      {/* Content */}
      <div key={activeTab} className="max-w-2xl mx-auto px-4 py-4 vik-fade-in">
        {renderContent()}
      </div>
    </div>
  );
}

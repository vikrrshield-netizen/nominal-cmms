// src/pages/GlassRegisterPage.tsx
// VIKRR — Asset Shield — „Registr skla a křehkého plastu" (IFS/BRCGS 4.9, Tesco S14).
// Sklo/křehký plast = zařízení (sklo, průzor, zářivka, kryt, keramika…). Hlídá se celistvost.

import { GlassWater } from 'lucide-react';
import AuditRegister, { auditNorm } from '../components/audit/AuditRegister';
import type { Asset } from '../types/asset';

const GLASS_RE = /(sklo|sklen|krehk|keramik|zariv|plexi|polykarbon|pruzor|sledov)/;
const detect = (a: Asset): boolean =>
  GLASS_RE.test(auditNorm(`${a.name} ${a.entityType} ${a.category} ${a.code}`)) ||
  (a.events ?? []).some((e) => auditNorm(e.name).includes('celistvost'));

export default function GlassRegisterPage() {
  return (
    <AuditRegister
      detect={detect}
      config={{
        title: 'Sklo a křehký plast',
        subtitle: 'Registr skla / křehkého plastu — celistvost a stav (pro audit).',
        icon: GlassWater,
        itemNoun: 'prvek',
        emptyHint: 'Zatím tu nic není. Přidej v kartotéce zařízení se jménem Sklo / Průzor / Zářivka / Kryt / Keramika… a objeví se tady.',
        events: [{ name: 'Kontrola celistvosti', eventType: 'integrity_check', frequencyDays: 30 }],
        doneLabel: 'zapsat kontrolu',
      }}
    />
  );
}

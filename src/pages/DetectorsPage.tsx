// src/pages/DetectorsPage.tsx
// VIKRR — Asset Shield — „Detektory cizích těles" (IFS Food v8: údržba min. 1×/12 měs.; Tesco S15).
// Detektor kovů / RTG / síto / magnet = zařízení. Hlídá se test funkčnosti + údržba (každé á 1 rok).

import { ScanLine } from 'lucide-react';
import AuditRegister, { auditNorm } from '../components/audit/AuditRegister';
import type { Asset } from '../types/asset';

const DETECTOR_RE = /(detektor|rtg|rentgen|\bsito|magnet|x-?ray|metal ?detect)/;
const detect = (a: Asset): boolean =>
  DETECTOR_RE.test(auditNorm(`${a.name} ${a.entityType} ${a.category} ${a.code}`)) ||
  (a.events ?? []).some((e) => auditNorm(e.eventType).includes('detector'));

export default function DetectorsPage() {
  return (
    <AuditRegister
      detect={detect}
      config={{
        title: 'Detektory cizích těles',
        subtitle: 'Kov / RTG / síta / magnety — test a údržba min. 1×/rok (IFS v8).',
        icon: ScanLine,
        itemNoun: 'detektor',
        emptyHint: 'Zatím tu nic není. Přidej v kartotéce zařízení se jménem Detektor kovů / RTG / Síto / Magnet… a objeví se tady.',
        events: [
          { name: 'Test funkčnosti', eventType: 'detector_test', frequencyDays: 365 },
          { name: 'Údržba detektoru', eventType: 'detector_maintenance', frequencyDays: 365 },
        ],
        doneLabel: 'zapsat',
      }}
    />
  );
}

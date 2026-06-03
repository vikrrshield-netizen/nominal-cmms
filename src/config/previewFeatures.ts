export type PreviewFeatureStatus = 'draft' | 'review' | 'ready';

export interface PreviewFeature {
  key: string;
  title: string;
  description: string;
  targetPath: string;
  status: PreviewFeatureStatus;
}

export const PREVIEW_STORAGE_KEY = 'nominal-preview-features';
export const PREVIEW_FLAGS_CHANGED_EVENT = 'nominal-preview-flags-changed';

export const PREVIEW_FEATURES: PreviewFeature[] = [
  {
    key: 'dashboard-next',
    title: 'Dashboard - dalsi vzhled',
    description: 'Testovani novych widgetu, karet a zkratek pred pustenim beznym rolim.',
    targetPath: '/',
    status: 'draft',
  },
  {
    key: 'kiosk-next',
    title: 'Kiosk - nove toky',
    description: 'Bezpecne misto pro zmeny kiosku: dataloggery, predani smeny, predfiltry a role.',
    targetPath: '/kiosk',
    status: 'draft',
  },
  {
    key: 'asset-card-next',
    title: 'Rodne listy / kartoteka',
    description: 'Upravy rodnych listu, historie a stromu kartoteky bez dopadu na provoz.',
    targetPath: '/kartoteka',
    status: 'review',
  },
  {
    key: 'compliance-next',
    title: 'IFS / Tesco audit pack',
    description: 'Test vystupu, filtru a dukazu pro food safety a Tesco audit.',
    targetPath: '/reports',
    status: 'draft',
  },
];

export function readPreviewFlags(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writePreviewFlag(key: string, enabled: boolean) {
  if (typeof window === 'undefined') return;

  const next = { ...readPreviewFlags(), [key]: enabled };
  window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(PREVIEW_FLAGS_CHANGED_EVENT));
}

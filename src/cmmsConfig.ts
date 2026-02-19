// src/cmmsConfig.ts
// Nominal CMMS — Domain-specific configuration (categories, priorities, work types)

export const cmmsConfig = {
  faultCategories: [
    { id: 'elektro', label: '⚡ Elektro' },
    { id: 'mechanika', label: '🔧 Mechanika' },
    { id: 'budova', label: '🏢 Budova' },
  ],
  priorities: [
    { id: 'P1', label: '🔴 P1 — Kritická (havárie)' },
    { id: 'P2', label: '🟠 P2 — Vysoká' },
    { id: 'P3', label: '🟡 P3 — Střední' },
    { id: 'P4', label: '🔵 P4 — Nízká' },
  ],
  workTypes: [
    { id: 'udrzba', label: 'Údržba' },
    { id: 'projekt_milan', label: 'Projekt/Milan' },
    { id: 'revize', label: 'Revize' },
    { id: 'sanitace', label: 'Sanitace' },
  ],
} as const;

// src/appConfig.ts
// Central branding configuration. Change this file to rebrand a company instance.

const appConfig = {
  // Umbrella brand.
  BRAND_NAME: 'VIKRR',
  // Product identity.
  PRODUCT_NAME: 'Provoz 360',
  PRODUCT_NAME_EN: 'Operations 360',
  PRODUCT_NAME_SHORT: 'Provoz 360',
  PRODUCT_LOCKUP: 'Provoz 360 by VIKRR',
  // Legacy aliases used across the app.
  APP_NAME: 'Provoz 360',
  APP_NAME_SHORT: 'Provoz360',
  // Company identity.
  COMPANY_NAME: 'Nominal',
  COMPANY_ADDRESS: 'Kozlov 68, 594 51',
  // Domain.
  DOMAIN: 'shield.vikrr.com',
  // Legal.
  COPYRIGHT: '© 2026 VIKRR. Všechna práva vyhrazena.',
  // Visual identity.
  PRIMARY_COLOR: '#1e3a5f',
  ACCENT_COLOR: '#3b82f6',
  SECONDARY_COLOR: '#64748b',
  LOGO_URL: '',
  LOGO_LETTER: 'N',
  // Meta.
  VERSION: 'v2.0',
} as const;

export default appConfig;

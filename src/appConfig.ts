// src/appConfig.ts
// Central branding configuration. Change this file to rebrand a company instance.

const appConfig = {
  // Umbrella brand.
  BRAND_NAME: 'VIKRR',
  // Product identity.
  PRODUCT_NAME: 'VIKRR Asset Shield',
  PRODUCT_NAME_SHORT: 'Asset Shield',
  // Legacy aliases used across the app.
  APP_NAME: 'VIKRR Asset Shield',
  APP_NAME_SHORT: 'VIKRR',
  // Company identity.
  COMPANY_NAME: 'VIKRR',
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
  LOGO_LETTER: 'V',
  // Meta.
  VERSION: 'v2.0',
} as const;

export default appConfig;

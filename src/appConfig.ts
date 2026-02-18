// src/appConfig.ts
// Central branding configuration — "White Rabbit"
// Change these values to rebrand the entire application.

const appConfig = {
  APP_NAME: 'Nominal CMMS',
  APP_NAME_SHORT: 'Nominal',
  PRIMARY_COLOR: '#f97316',        // orange-500
  LOGO_URL: '',                    // Optional: URL to logo image
  LOGO_LETTER: 'N',               // Fallback letter when no LOGO_URL
  VERSION: 'v1.0',
} as const;

export default appConfig;

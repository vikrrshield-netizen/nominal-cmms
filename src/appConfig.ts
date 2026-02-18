// src/appConfig.ts
// Central branding configuration — VIKRR Ecosystem
// Change these values to rebrand the entire application.

const appConfig = {
  // ── Umbrella Brand ──
  BRAND_NAME: 'VIKRR',
  // ── Product Identity ──
  PRODUCT_NAME: 'Krejčí Asset Shield',
  PRODUCT_NAME_SHORT: 'Asset Shield',
  // ── Legacy aliases (used across codebase) ──
  APP_NAME: 'Krejčí Asset Shield',
  APP_NAME_SHORT: 'VIKRR',
  // ── Company ──
  COMPANY_NAME: 'VIKRR | Vilém Krejčí',
  COMPANY_ADDRESS: 'Kozlov 68, 594 51',
  // ── Domain ──
  DOMAIN: 'shield.vikrr.com',
  // ── Legal ──
  COPYRIGHT: '© 2026 VIKRR | Vilém Krejčí. All rights reserved.',
  // ── Visual Identity ──
  PRIMARY_COLOR: '#1e3a5f',          // Deep Blue
  ACCENT_COLOR: '#3b82f6',           // Blue-500 accent
  SECONDARY_COLOR: '#64748b',        // Industrial Gray
  LOGO_URL: '',                      // Optional: URL to logo image
  LOGO_LETTER: 'V',                  // Fallback letter when no LOGO_URL
  // ── Meta ──
  VERSION: 'v2.0',
} as const;

export default appConfig;

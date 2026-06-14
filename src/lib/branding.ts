import appConfig from '../appConfig';

export const appBrand = {
  name: appConfig.APP_NAME,
  shortName: appConfig.APP_NAME_SHORT || appConfig.BRAND_NAME,
  productName: appConfig.PRODUCT_NAME,
  productShortName: appConfig.PRODUCT_NAME_SHORT,
  logoUrl: appConfig.LOGO_URL,
  logoLetter: appConfig.LOGO_LETTER,
  primaryColor: appConfig.PRIMARY_COLOR,
};

export function brandFilePrefix(suffix?: string) {
  const base = appBrand.shortName || appBrand.name;
  const safeBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return [safeBase || 'app', suffix].filter(Boolean).join('_');
}

export function brandLogoHtml(className = 'logo-box') {
  if (appBrand.logoUrl) {
    return `<img class="${className}" src="${appBrand.logoUrl}" alt="${appBrand.name}" />`;
  }
  return `<div class="${className}">${appBrand.logoLetter}</div>`;
}

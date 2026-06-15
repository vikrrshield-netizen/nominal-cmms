import appConfig from '../appConfig';
import { useAuthContext } from '../context/AuthContext';
import { useTenantSettings } from './useTenantSettings';

export interface RuntimeBrand {
  companyName: string;
  appName: string;
  productName: string;
  productLockup: string;
  logoUrl: string;
  logoLetter: string;
}

export function getStaticBrand(): RuntimeBrand {
  return {
    companyName: appConfig.COMPANY_NAME,
    appName: appConfig.APP_NAME,
    productName: appConfig.PRODUCT_NAME,
    productLockup: appConfig.PRODUCT_LOCKUP,
    logoUrl: appConfig.LOGO_URL,
    logoLetter: appConfig.LOGO_LETTER,
  };
}

export function useBrandSettings(): RuntimeBrand {
  const { user } = useAuthContext();
  const { tenants } = useTenantSettings();
  const tenantId = (user as { tenantId?: string } | null)?.tenantId || 'main_firm';
  const tenant = tenants.find((item) => item.id === tenantId);

  return {
    companyName: tenant?.name?.trim() || appConfig.COMPANY_NAME,
    appName: tenant?.appName?.trim() || appConfig.APP_NAME,
    productName: tenant?.appName?.trim() || appConfig.PRODUCT_NAME,
    productLockup: tenant?.appName?.trim()
      ? `${tenant.appName.trim()} by ${appConfig.BRAND_NAME}`
      : appConfig.PRODUCT_LOCKUP,
    logoUrl: tenant?.logoUrl?.trim() || appConfig.LOGO_URL,
    logoLetter: tenant?.logoLetter?.trim() || appConfig.LOGO_LETTER,
  };
}

import { useEffect, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import {
  PREVIEW_FLAGS_CHANGED_EVENT,
  readPreviewFlags,
  writePreviewFlag,
} from '../config/previewFeatures';

export function usePreviewFlags() {
  const { user } = useAuthContext();
  const [flags, setFlags] = useState<Record<string, boolean>>(() => readPreviewFlags());

  useEffect(() => {
    const sync = () => setFlags(readPreviewFlags());
    window.addEventListener('storage', sync);
    window.addEventListener(PREVIEW_FLAGS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(PREVIEW_FLAGS_CHANGED_EVENT, sync);
    };
  }, []);

  const isSuperAdmin = user?.role === 'SUPERADMIN';

  return {
    flags,
    isSuperAdmin,
    isEnabled: (key: string) => isSuperAdmin && flags[key] === true,
    setEnabled: (key: string, enabled: boolean) => {
      if (!isSuperAdmin) return;
      writePreviewFlag(key, enabled);
    },
  };
}

export function usePreviewFeature(key: string): boolean {
  const preview = usePreviewFlags();
  return preview.isEnabled(key);
}

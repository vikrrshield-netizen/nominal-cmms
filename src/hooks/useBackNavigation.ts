import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type NavigationState = {
  from?: string;
};

export function useBackNavigation(defaultFallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback((fallback?: string) => {
    const state = (location.state as NavigationState | null) || {};
    const fallbackPath = fallback || state.from || defaultFallback;
    const routerIndex = typeof window !== 'undefined'
      ? (window.history.state as { idx?: number } | null)?.idx
      : 0;

    if (typeof routerIndex === 'number' && routerIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackPath);
  }, [defaultFallback, location.state, navigate]);
}

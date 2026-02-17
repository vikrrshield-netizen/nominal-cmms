import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type ZoneMode = 'GLUTEN' | 'GLUTEN_FREE' | 'SANITATION_LOCKDOWN';
type Shift = 'RANNI' | 'ODPOLEDNI' | 'NOCNI';

interface GlobalState {
  currentZone: ZoneMode;
  currentShift: Shift;
  isSystemLocked: boolean;
  setZone: (zone: ZoneMode) => void;
}

const GlobalStateContext = createContext<GlobalState | null>(null);

const getShiftFromHour = (hour: number): Shift => {
  if (hour >= 6 && hour < 14) return 'RANNI';
  if (hour >= 14 && hour < 22) return 'ODPOLEDNI';
  return 'NOCNI';
};

export const GlobalStateProvider = ({ children }: { children: ReactNode }) => {
  const [currentZone, setCurrentZone] = useState<ZoneMode>('GLUTEN');
  const [currentShift, setCurrentShift] = useState<Shift>(getShiftFromHour(new Date().getHours()));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentShift(getShiftFromHour(new Date().getHours()));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const setZone = (zone: ZoneMode) => {
    setCurrentZone(zone);
  };

  const isSystemLocked = currentZone === 'SANITATION_LOCKDOWN';

  return (
    <GlobalStateContext.Provider value={{ currentZone, currentShift, isSystemLocked, setZone }}>
      {children}
    </GlobalStateContext.Provider>
  );
};

export const useGlobalState = (): GlobalState => {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within GlobalStateProvider');
  }
  return context;
};

const ZONE_BANNER_STYLES: Record<ZoneMode, { bg: string; text: string; label: string }> = {
  GLUTEN: { bg: 'bg-amber-600', text: 'text-white', label: 'GLUTEN' },
  GLUTEN_FREE: { bg: 'bg-green-600', text: 'text-white', label: 'GLUTEN-FREE' },
  SANITATION_LOCKDOWN: { bg: 'bg-red-600', text: 'text-white', label: '⚠️ SANACE - SYSTÉM UZAMČEN' },
};

export const ZoneBanner = () => {
  const { currentZone } = useGlobalState();
  const style = ZONE_BANNER_STYLES[currentZone];
  
  return (
    <div className={`${style.bg} ${style.text} text-center py-1 text-sm font-semibold`}>
      {style.label}
    </div>
  );
};

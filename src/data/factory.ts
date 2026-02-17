export interface Building {
  id: string;
  name: string;
  shortName: string;
  color: string;
  description: string;
}

export interface Room {
  id: string;
  buildingId: string;
  name: string;
  floor: number;
  zone: 'GLUTEN' | 'GLUTEN_FREE' | 'NEUTRAL';
  category: 'production' | 'storage' | 'utility' | 'office' | 'maintenance';
}

export const BUILDINGS: Building[] = [
  { id: 'A', name: 'Administrativa', shortName: 'A', color: '#3b82f6', description: 'Kanceláře, vedení' },
  { id: 'B', name: 'Krček', shortName: 'B', color: '#8b5cf6', description: 'Spojovací budova' },
  { id: 'C', name: 'Zázemí/Vedení', shortName: 'C', color: '#06b6d4', description: 'Šatny, sociální zázemí' },
  { id: 'D', name: 'VÝROBA', shortName: 'D', color: '#f59e0b', description: 'Mlýn, míchárna, balírna, velín, sklady, kotelna' },
  { id: 'E', name: 'Dílna + Sklad ND', shortName: 'E', color: '#22c55e', description: 'Dílna, sklad náhradních dílů, garáž' },
];

export const ROOMS: Room[] = [
  { id: 'A-01', buildingId: 'A', name: 'Recepce', floor: 0, zone: 'NEUTRAL', category: 'office' },
  { id: 'A-02', buildingId: 'A', name: 'Kancelář vedení', floor: 1, zone: 'NEUTRAL', category: 'office' },
  { id: 'A-03', buildingId: 'A', name: 'Zasedací místnost', floor: 1, zone: 'NEUTRAL', category: 'office' },
  { id: 'B-01', buildingId: 'B', name: 'Chodba', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'C-01', buildingId: 'C', name: 'Šatny muži', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'C-02', buildingId: 'C', name: 'Šatny ženy', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'C-03', buildingId: 'C', name: 'Jídelna', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'D-MLY', buildingId: 'D', name: 'Mlýn', floor: 0, zone: 'GLUTEN', category: 'production' },
  { id: 'D-MIC', buildingId: 'D', name: 'Míchárna', floor: 0, zone: 'GLUTEN', category: 'production' },
  { id: 'D-BAL', buildingId: 'D', name: 'Balírna', floor: 0, zone: 'GLUTEN', category: 'production' },
  { id: 'D-VEL', buildingId: 'D', name: 'Velín extruze', floor: 1, zone: 'GLUTEN', category: 'production' },
  { id: 'D-EXT', buildingId: 'D', name: 'Extrudery', floor: 1, zone: 'GLUTEN', category: 'production' },
  { id: 'D-SKL1', buildingId: 'D', name: 'Sklad surovin', floor: 0, zone: 'GLUTEN', category: 'storage' },
  { id: 'D-SKL2', buildingId: 'D', name: 'Sklad hotových výrobků', floor: 0, zone: 'GLUTEN', category: 'storage' },
  { id: 'D-KOT', buildingId: 'D', name: 'Kotelna', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'D-KOM', buildingId: 'D', name: 'Kompresory', floor: 0, zone: 'NEUTRAL', category: 'utility' },
  { id: 'E-DIL', buildingId: 'E', name: 'Dílna', floor: 0, zone: 'NEUTRAL', category: 'maintenance' },
  { id: 'E-SND', buildingId: 'E', name: 'Sklad náhradních dílů', floor: 0, zone: 'NEUTRAL', category: 'storage' },
  { id: 'E-GAR', buildingId: 'E', name: 'Garáž', floor: 0, zone: 'NEUTRAL', category: 'maintenance' },
];

export const ZONE_COLORS = {
  GLUTEN: { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-400' },
  GLUTEN_FREE: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400' },
  NEUTRAL: { bg: 'bg-slate-500/20', border: 'border-slate-500', text: 'text-slate-400' },
};

export const CATEGORY_ICONS: Record<Room['category'], string> = {
  production: '🏭',
  storage: '📦',
  utility: '⚡',
  office: '🏢',
  maintenance: '🔧',
};

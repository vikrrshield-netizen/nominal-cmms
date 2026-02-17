export type WOStatus = 'new' | 'assigned' | 'in_progress' | 'waiting_parts' | 'done' | 'cancelled';
export type WOPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type WOType = 'breakdown' | 'preventive' | 'inspection' | 'improvement';

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  type: WOType;
  priority: WOPriority;
  status: WOStatus;
  assetId: string;
  roomId: string;
  buildingId: string;
  reportedBy: string;
  reportedByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  notes?: string;
}

export const WO_STATUS_CONFIG: Record<WOStatus, { label: string; color: string; icon: string }> = {
  new: { label: 'Nový', color: 'bg-blue-500', icon: '🆕' },
  assigned: { label: 'Přiřazen', color: 'bg-purple-500', icon: '👤' },
  in_progress: { label: 'V řešení', color: 'bg-amber-500', icon: '🔧' },
  waiting_parts: { label: 'Čeká na díly', color: 'bg-orange-500', icon: '📦' },
  done: { label: 'Hotovo', color: 'bg-green-500', icon: '✅' },
  cancelled: { label: 'Zrušeno', color: 'bg-slate-500', icon: '❌' },
};

export const WO_PRIORITY_CONFIG: Record<WOPriority, { label: string; color: string; description: string }> = {
  P1: { label: 'P1 - Havárie', color: 'bg-red-500', description: 'Okamžitě řešit' },
  P2: { label: 'P2 - Tento týden', color: 'bg-orange-500', description: 'Do konce týdne' },
  P3: { label: 'P3 - Běžná', color: 'bg-yellow-500', description: 'Dle kapacity' },
  P4: { label: 'P4 - Nápad', color: 'bg-slate-500', description: 'Do backlogu' },
};

export const WO_TYPE_CONFIG: Record<WOType, { label: string; icon: string }> = {
  breakdown: { label: 'Porucha', icon: '🔧' },
  preventive: { label: 'Preventivní', icon: '📅' },
  inspection: { label: 'Kontrola', icon: '🔍' },
  improvement: { label: 'Zlepšení', icon: '💡' },
};

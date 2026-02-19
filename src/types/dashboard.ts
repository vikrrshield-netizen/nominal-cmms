// src/types/dashboard.ts
// VIKRR — Asset Shield — Dashboard Widget System Types

import type { Timestamp } from 'firebase/firestore';
import type { UserRole, Permission } from './user';

// Widget categories
export type WidgetType = 'tile' | 'widget' | 'action';

// Widget size variants (for future grid layouts)
export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2' | 'full';

// Definition of a widget (static registry entry)
export interface WidgetDefinition {
  id: string;
  type: WidgetType;
  label: string;
  icon: string;
  gradient: string;
  defaultSize: WidgetSize;
  component: string;
  minRole?: UserRole;
  requiredPermission?: Permission;
}

// Instance of a widget in user's dashboard config
export interface WidgetInstance {
  widgetId: string;
  position: number;
  visible: boolean;
  collapsed: boolean;
  size: WidgetSize;
}

// Persisted dashboard configuration (Firestore + localStorage)
export interface DashboardConfig {
  userId: string;
  widgets: WidgetInstance[];
  updatedAt: Timestamp | null;
}

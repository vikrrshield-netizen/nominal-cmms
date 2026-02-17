export type FleetCategory = 'vzv' | 'vehicle' | 'agri';

export interface FleetItem {
  id?: string;
  name: string;
  code?: string;
  category: FleetCategory;
  manufacturer?: string;
  licensePlate?: string;
  status: 'operational' | 'maintenance' | 'broken';
}

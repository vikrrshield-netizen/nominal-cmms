export type ProductionMachineRecipeStatus = 'draft' | 'active' | 'archived';

export type ProductionMachineKind = 'extruder' | 'mill' | 'mixer' | 'packer' | 'other';
export type ProductionOutputMode = 'hopper' | 'bulk_bag' | 'bag' | 'box' | 'mill' | 'mixer' | 'other';

export interface ProductionRecipeItem {
  materialId: string;
  materialName: string;
  ratio: number;
}

export interface ProductionMachineRecipeDoc {
  id: string;
  machineId: string;
  machineName: string;
  productId: string;
  productName: string;
  productNumber: string;
  status: ProductionMachineRecipeStatus;
  recipe?: ProductionRecipeItem[];
  note?: string;
  createdAt?: Date | null;
  createdById?: string;
  createdByName?: string;
  updatedAt?: Date | null;
  updatedById?: string;
  updatedByName?: string;
}

export interface SaveProductionMachineRecipeInput {
  machineId: string;
  machineName: string;
  productId: string;
  productName: string;
  productNumber: string;
  status: ProductionMachineRecipeStatus;
  recipe?: ProductionRecipeItem[];
  note?: string;
  user?: {
    uid?: string;
    id?: string;
    displayName?: string;
  } | null;
}

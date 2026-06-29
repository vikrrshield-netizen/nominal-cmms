// src/pages/ProductionPage.tsx
// Nominal CMMS — Production Planning: Extrusion & Packaging

import { useState, useEffect, useMemo } from 'react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import {
  collection, addDoc, updateDoc, doc, onSnapshot, writeBatch,
  orderBy, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft, Loader2, Plus, X, Play, Square, Clock,
  Package, Cog, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import MicButton from '../components/ui/MicButton';
import { formatCounter, nextCounterValue } from '../services/counterService';
import { isExtruderAsset, normalizeGearboxText } from '../services/gearboxService';
import { materialBatch, productBatch } from '../data/productionMasterSeed';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type ActiveTab = 'extrusion' | 'packaging';
type ExtrusionArea = string;

interface ProductionMaterial {
  id: string;
  name: string;
}

interface ProductionAreaOption {
  id: string;
  name: string;
}

interface ProductionExtruderOption {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
}

interface MasterMaterial {
  id: string;
  number: string;
  nkCode: string;
  name: string;
  active?: boolean;
  usageCount?: number;
}

interface ProductRecipeItem {
  materialId: string;
  materialName: string;
  ratio: number;
}

interface MasterProduct {
  id: string;
  number: string;
  nkCode: string;
  name: string;
  active?: boolean;
  recipe?: ProductRecipeItem[];
  targetMotorLoadAmps?: number | null;
}

interface MixingRecipeSnapshotItem {
  materialId: string;
  materialName: string;
  ratio: number;
  plannedAmountKg: number;
  materialBatch: string;
}

// -- Extrusion --
type ExtrusionStatus = 'planned' | 'running' | 'done';
interface ExtrusionBatch {
  id: string;
  batchId: string;
  rawMaterial: string;
  productId?: string;
  productName?: string;
  productBatch?: string;
  materialId?: string;
  materialName?: string;
  materialBatch?: string;
  mixingRecipeSnapshot?: MixingRecipeSnapshotItem[];
  mixingNote?: string;
  targetMotorLoadAmps?: number | null;
  targetWeight: number;
  planDate: string;
  productionArea: ExtrusionArea;
  productionAreaLabel: string;
  machineId: string;
  machineName: string;
  machineIds?: string[];
  machineNames?: string[];
  machineCatalogId?: string;
  machineCatalogIds?: string[];
  note: string;
  status: ExtrusionStatus;
  shiftLog: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}

// -- Packaging --
type PackagingStatus = 'planned' | 'running' | 'done';
interface PackagingOrder {
  id: string;
  productId: string;
  packagingType: string;
  palletCount: number;
  lineId: string;
  lineName: string;
  deadline: string;
  status: PackagingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
}

// -- Asset (for machine/line picker) --
interface SimpleAsset {
  id: string;
  name: string;
  code?: string;
  category?: string;
  entityType?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  planned: { label: 'Plánováno', dot: 'bg-blue-400',    bg: 'bg-blue-500/15',    text: 'text-blue-700' },
  running: { label: 'Probíhá',  dot: 'bg-amber-400 animate-pulse', bg: 'bg-amber-500/15', text: 'text-amber-700' },
  done:    { label: 'Hotovo',   dot: 'bg-emerald-400',  bg: 'bg-emerald-500/15', text: 'text-emerald-700' },
};

const RAW_MATERIALS = [
  'Pšeničná mouka', 'Kukuřičný grít', 'Rýžová mouka',
  'Bramborový škrob', 'Směs A (standard)', 'Směs B (bezlepek)',
];

const PACKAGING_TYPES = [
  'Sáček 100g', 'Sáček 250g', 'Sáček 500g',
  'Krabice 1kg', 'Multipack 6ks', 'Big Bag 25kg',
];

const EXTRUSION_LINES: { number: number; area: ExtrusionArea; areaLabel: string; label: string }[] = [
  { number: 1, area: 'extrudovna_i', areaLabel: 'Extrudovna I', label: 'Extruder 1' },
  { number: 2, area: 'extrudovna_i', areaLabel: 'Extrudovna I', label: 'Extruder 2' },
  { number: 3, area: 'extrudovna_ii', areaLabel: 'Extrudovna II', label: 'Extruder 3' },
  { number: 4, area: 'extrudovna_ii', areaLabel: 'Extrudovna II', label: 'Extruder 4' },
];

const DEFAULT_PRODUCTION_AREAS: ProductionAreaOption[] = [
  { id: 'extrudovna_i', name: 'Extrudovna I' },
  { id: 'extrudovna_ii', name: 'Extrudovna II' },
];

const DEFAULT_PRODUCTION_EXTRUDERS: ProductionExtruderOption[] = EXTRUSION_LINES.map((line) => ({
  id: `extruder-${line.number}`,
  name: line.label,
  areaId: line.area,
  areaName: line.areaLabel,
}));

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════

function useExtrusionBatches() {
  const [batches, setBatches] = useState<ExtrusionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'production_extrusion'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          batchId: data.batchId || '',
          rawMaterial: data.rawMaterial || '',
          productId: data.productId || '',
          productName: data.productName || '',
          productBatch: data.productBatch || '',
          materialId: data.materialId || '',
          materialName: data.materialName || '',
          materialBatch: data.materialBatch || '',
          mixingRecipeSnapshot: Array.isArray(data.mixingRecipeSnapshot) ? data.mixingRecipeSnapshot : [],
          mixingNote: data.mixingNote || '',
          targetMotorLoadAmps: typeof data.targetMotorLoadAmps === 'number' ? data.targetMotorLoadAmps : null,
          targetWeight: data.targetWeight || 0,
          planDate: data.planDate || '',
          productionArea: data.productionArea || 'extrudovna_i',
          productionAreaLabel: data.productionAreaLabel || (data.productionArea === 'extrudovna_ii' ? 'Extrudovna II' : 'Extrudovna I'),
          machineId: data.machineId || '',
          machineName: data.machineName || '',
          machineIds: Array.isArray(data.machineIds) ? data.machineIds : (data.machineId ? [data.machineId] : []),
          machineNames: Array.isArray(data.machineNames) ? data.machineNames : (data.machineName ? [data.machineName] : []),
          machineCatalogId: data.machineCatalogId || '',
          machineCatalogIds: Array.isArray(data.machineCatalogIds) ? data.machineCatalogIds : (data.machineCatalogId ? [data.machineCatalogId] : []),
          note: data.note || '',
          status: data.status || 'planned',
          shiftLog: data.shiftLog || '',
          startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toDate() : null,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : null,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdById: data.createdById || '',
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { batches, loading };
}

function usePackagingOrders() {
  const [orders, setOrders] = useState<PackagingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'production_packaging'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          productId: data.productId || '',
          packagingType: data.packagingType || '',
          palletCount: data.palletCount || 0,
          lineId: data.lineId || '',
          lineName: data.lineName || '',
          deadline: data.deadline || '',
          status: data.status || 'planned',
          startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toDate() : null,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : null,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdById: data.createdById || '',
          createdByName: data.createdByName || '',
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return { orders, loading };
}

function useProductionCatalogs(canManage: boolean, user: any) {
  const [materials, setMaterials] = useState<ProductionMaterial[]>([]);
  const [areas, setAreas] = useState<ProductionAreaOption[]>([]);
  const [extruders, setExtruders] = useState<ProductionExtruderOption[]>([]);
  const [ready, setReady] = useState({ materials: false, areas: false, extruders: false });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'production_materials'), (snap) => {
      if (snap.empty && canManage) {
        const batch = writeBatch(db);
        RAW_MATERIALS.forEach((name, index) => {
          batch.set(doc(db, 'production_materials', `material-${index + 1}`), {
            name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdById: user?.uid || user?.id || '',
            createdByName: user?.displayName || 'System',
          });
        });
        void batch.commit().catch(() => undefined);
      }

      setMaterials(snap.docs.map((d) => ({ id: d.id, name: d.data().name || '' }))
        .filter((item) => item.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')));
      setReady((prev) => ({ ...prev, materials: true }));
    }, () => setReady((prev) => ({ ...prev, materials: true })));
    return () => unsub();
  }, [canManage, user?.uid, user?.id, user?.displayName]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'production_areas'), (snap) => {
      if (snap.empty && canManage) {
        const batch = writeBatch(db);
        DEFAULT_PRODUCTION_AREAS.forEach((area) => {
          batch.set(doc(db, 'production_areas', area.id), {
            name: area.name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdById: user?.uid || user?.id || '',
            createdByName: user?.displayName || 'System',
          });
        });
        void batch.commit().catch(() => undefined);
      }

      setAreas(snap.docs.map((d) => ({ id: d.id, name: d.data().name || '' }))
        .filter((item) => item.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')));
      setReady((prev) => ({ ...prev, areas: true }));
    }, () => setReady((prev) => ({ ...prev, areas: true })));
    return () => unsub();
  }, [canManage, user?.uid, user?.id, user?.displayName]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'production_extruders'), (snap) => {
      if (snap.empty && canManage) {
        const batch = writeBatch(db);
        DEFAULT_PRODUCTION_EXTRUDERS.forEach((extruder) => {
          batch.set(doc(db, 'production_extruders', extruder.id), {
            name: extruder.name,
            areaId: extruder.areaId,
            areaName: extruder.areaName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdById: user?.uid || user?.id || '',
            createdByName: user?.displayName || 'System',
          });
        });
        void batch.commit().catch(() => undefined);
      }

      setExtruders(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          areaId: data.areaId || '',
          areaName: data.areaName || '',
        };
      })
        .filter((item) => item.name && item.areaId)
        .sort((a, b) => (a.areaName + a.name).localeCompare(b.areaName + b.name, 'cs')));
      setReady((prev) => ({ ...prev, extruders: true }));
    }, () => setReady((prev) => ({ ...prev, extruders: true })));
    return () => unsub();
  }, [canManage, user?.uid, user?.id, user?.displayName]);

  return {
    materials,
    areas,
    extruders,
    loading: !ready.materials || !ready.areas || !ready.extruders,
  };
}

function useProductionMasterData() {
  const [materials, setMaterials] = useState<MasterMaterial[]>([]);
  const [products, setProducts] = useState<MasterProduct[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'materials'), (snap) => {
      setMaterials(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          number: data.number || '',
          nkCode: data.nkCode || '',
          name: data.name || '',
          active: data.active !== false,
          usageCount: data.usageCount || 0,
        };
      })
        .filter((item) => item.active !== false && item.name)
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'cs')));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          number: data.number || '',
          nkCode: data.nkCode || '',
          name: data.name || '',
          active: data.active !== false,
          recipe: Array.isArray(data.recipe) ? data.recipe : [],
          targetMotorLoadAmps: typeof data.targetMotorLoadAmps === 'number' ? data.targetMotorLoadAmps : null,
        };
      })
        .filter((item) => item.active !== false && item.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    });
    return () => unsub();
  }, []);

  return { materials, products };
}

function useAssetsPicker(category?: string) {
  const [assets, setAssets] = useState<SimpleAsset[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'assets'), (snap) => {
      let all = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        code: d.data().code || '',
        category: d.data().category || '',
        entityType: d.data().entityType || '',
      }));
      if (category) all = all.filter(a => a.category === category);
      setAssets(all.sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    });
    return () => unsub();
  }, [category]);
  return assets;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function counterScope(value: string): string {
  return normalizeGearboxText(value || 'general')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'general';
}

async function generateBatchId(scope = 'general'): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateKey = `${y}${m}${d}`;
  const seq = await nextCounterValue(`production_extrusion_${dateKey}_${counterScope(scope)}`);
  return `EX-${dateKey}-${formatCounter(seq)}`;
}

async function generateProductId(scope = 'general'): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateKey = `${y}${m}${d}`;
  const seq = await nextCounterValue(`production_packaging_${dateKey}_${counterScope(scope)}`);
  return `PK-${dateKey}-${formatCounter(seq)}`;
}

function firstNumber(value: string): string {
  return normalizeGearboxText(value).match(/\d+/)?.[0] || '';
}

function isProductionExtruderAsset(asset: SimpleAsset): boolean {
  if (!isExtruderAsset(asset)) return false;
  const text = normalizeGearboxText([asset.name, asset.code, asset.category, asset.entityType].filter(Boolean).join(' '));
  return !/(predfiltr|pre-filter|filter|vzt|vzduchotech|prevodov|gearbox|datalog|logger)/.test(text);
}

function findRealExtruderAsset(line: ProductionExtruderOption | undefined, assets: SimpleAsset[]): SimpleAsset | undefined {
  if (!line) return undefined;
  const lineName = normalizeGearboxText(line.name);
  const lineNumber = firstNumber(line.name);

  return assets
    .filter(isProductionExtruderAsset)
    .map((asset) => {
      const assetName = normalizeGearboxText(asset.name);
      const assetCode = normalizeGearboxText(asset.code);
      const assetNumber = firstNumber(`${asset.name} ${asset.code}`);
      let score = 0;
      if (assetName === lineName) score += 100;
      if (assetName.includes(lineName) || lineName.includes(assetName)) score += 50;
      if (lineNumber && assetNumber === lineNumber) score += 40;
      if (assetCode && lineNumber && assetCode.includes(lineNumber.padStart(3, '0'))) score += 20;
      return { asset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.asset;
}

function getBatchMachineIds(batch: ExtrusionBatch): string[] {
  if (batch.machineIds?.length) return batch.machineIds.filter(Boolean);
  return batch.machineId ? [batch.machineId] : [];
}

function getBatchMachineNames(batch: ExtrusionBatch): string[] {
  if (batch.machineNames?.length) return batch.machineNames.filter(Boolean);
  return batch.machineName ? [batch.machineName] : [];
}

function getBatchMachineLabel(batch: ExtrusionBatch): string {
  const names = getBatchMachineNames(batch);
  return names.length ? names.join(' + ') : '—';
}

function getBatchMachineFilterIds(batch: ExtrusionBatch): string[] {
  return Array.from(new Set([
    ...getBatchMachineIds(batch),
    ...(batch.machineCatalogIds || []),
    ...(batch.machineCatalogId ? [batch.machineCatalogId] : []),
  ].filter(Boolean)));
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start) return '—';
  const to = end || new Date();
  const mins = Math.floor((to.getTime() - start.getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return `${hrs}h ${rm}m`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ProductionPage() {
  const goBack = useBackNavigation('/');
  const { user, hasPermission } = useAuthContext();
  const canManage = hasPermission('production.manage');
  const { materials, areas, extruders: catalogExtruders } = useProductionCatalogs(canManage, user);
  const { materials: masterMaterials, products: masterProducts } = useProductionMasterData();

  const [activeTab, setActiveTab] = useState<ActiveTab>('extrusion');

  // Extrusion
  const { batches, loading: loadingBatches } = useExtrusionBatches();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({
    planDate: localDateKey(),
    productionArea: 'extrudovna_i' as ExtrusionArea,
    extruderId: 'extruder-1',
    extruderIds: ['extruder-1'] as string[],
    productId: '',
    materialId: '',
    productBatchDate: localDateKey(),
    materialBatchDate: localDateKey(),
    materialBatchSuffix: 'A',
    materialBatchOverride: '',
    rawMaterial: '',
    targetWeight: '',
    mixingNote: '',
    note: '',
  });
  const [batchSaving, setBatchSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ExtrusionBatch | null>(null);
  const [shiftLogId, setShiftLogId] = useState<string | null>(null);
  const [shiftLogText, setShiftLogText] = useState('');

  // Packaging
  const { orders, loading: loadingOrders } = usePackagingOrders();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ packagingType: '', palletCount: '', lineId: '', lineName: '', deadline: '' });
  const [orderSaving, setOrderSaving] = useState(false);
  const [catalogForms, setCatalogForms] = useState({
    material: '',
    area: '',
    extruder: '',
    extruderAreaId: 'extrudovna_i',
  });
  const [showCatalogSettings, setShowCatalogSettings] = useState(false);

  // Machine filter for extrusion
  const [machineFilter, setMachineFilter] = useState<string>('ALL');
  const [planDateFilter, setPlanDateFilter] = useState<string>('ALL');

  // Asset pickers
  const packagingAssets = useAssetsPicker('packaging');
  // Fallback: all assets if categories are empty
  const allAssets = useAssetsPicker();
  const packagingOptions = packagingAssets.length > 0 ? packagingAssets : allAssets;

  const materialOptions = useMemo<ProductionMaterial[]>(
    () => materials.length > 0 ? materials : RAW_MATERIALS.map((name, index) => ({ id: `fallback-material-${index + 1}`, name })),
    [materials],
  );

  const areaOptions = useMemo<ProductionAreaOption[]>(
    () => areas.length > 0 ? areas : DEFAULT_PRODUCTION_AREAS,
    [areas],
  );

  const extrusionLineOptions = useMemo<ProductionExtruderOption[]>(
    () => catalogExtruders.length > 0 ? catalogExtruders : DEFAULT_PRODUCTION_EXTRUDERS,
    [catalogExtruders],
  );

  const visibleExtrusionLines = useMemo(
    () => extrusionLineOptions.filter((line) => line.areaId === batchForm.productionArea),
    [batchForm.productionArea, extrusionLineOptions],
  );

  const selectedProduct = useMemo(
    () => masterProducts.find((product) => product.id === batchForm.productId),
    [batchForm.productId, masterProducts],
  );

  const selectedMaterial = useMemo(
    () => masterMaterials.find((material) => material.id === batchForm.materialId),
    [batchForm.materialId, masterMaterials],
  );

  const selectedProductBatch = useMemo(() => {
    if (!selectedProduct?.number || !batchForm.productBatchDate) return '';
    return productBatch(selectedProduct.number, new Date(`${batchForm.productBatchDate}T00:00:00`));
  }, [batchForm.productBatchDate, selectedProduct]);

  const selectedMaterialBatch = useMemo(() => {
    if (batchForm.materialBatchOverride.trim()) return batchForm.materialBatchOverride.trim();
    if (!selectedMaterial?.number || !batchForm.materialBatchDate) return '';
    return materialBatch(selectedMaterial.number, new Date(`${batchForm.materialBatchDate}T00:00:00`), batchForm.materialBatchSuffix || 'A');
  }, [batchForm.materialBatchDate, batchForm.materialBatchOverride, batchForm.materialBatchSuffix, selectedMaterial]);

  const mixingRecipeSnapshot = useMemo<MixingRecipeSnapshotItem[]>(() => {
    const targetWeight = Number(batchForm.targetWeight) || 0;
    const recipe = selectedProduct?.recipe || [];
    const totalRatio = recipe.reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
    if (!targetWeight || !totalRatio) {
      return recipe.map((row) => ({
        materialId: row.materialId,
        materialName: row.materialName,
        ratio: Number(row.ratio) || 0,
        plannedAmountKg: 0,
        materialBatch: row.materialId === selectedMaterial?.id ? selectedMaterialBatch : '',
      }));
    }
    return recipe.map((row) => ({
      materialId: row.materialId,
      materialName: row.materialName,
      ratio: Number(row.ratio) || 0,
      plannedAmountKg: Math.round((targetWeight * ((Number(row.ratio) || 0) / totalRatio)) * 10) / 10,
      materialBatch: row.materialId === selectedMaterial?.id ? selectedMaterialBatch : '',
    }));
  }, [batchForm.targetWeight, selectedMaterial?.id, selectedMaterialBatch, selectedProduct]);

  useEffect(() => {
    if (selectedMaterial?.name && batchForm.rawMaterial !== selectedMaterial.name) {
      setBatchForm((prev) => ({ ...prev, rawMaterial: selectedMaterial.name }));
    }
  }, [batchForm.rawMaterial, selectedMaterial]);

  useEffect(() => {
    if (!areaOptions.some((area) => area.id === batchForm.productionArea)) {
      setBatchForm((prev) => ({ ...prev, productionArea: areaOptions[0]?.id || 'extrudovna_i' }));
    }
  }, [areaOptions, batchForm.productionArea]);

  useEffect(() => {
    const visibleIds = new Set(visibleExtrusionLines.map((line) => line.id));
    const nextSelected = batchForm.extruderIds.filter((id) => visibleIds.has(id));
    const fallback = visibleExtrusionLines[0]?.id ? [visibleExtrusionLines[0].id] : [];
    const safeSelected = nextSelected.length ? nextSelected : fallback;
    if (
      safeSelected.length !== batchForm.extruderIds.length ||
      safeSelected.some((id, index) => id !== batchForm.extruderIds[index]) ||
      batchForm.extruderId !== (safeSelected[0] || '')
    ) {
      setBatchForm((prev) => ({
        ...prev,
        extruderIds: safeSelected,
        extruderId: safeSelected[0] || '',
      }));
    }
  }, [batchForm.extruderId, batchForm.extruderIds, visibleExtrusionLines]);

  useEffect(() => {
    if (!areaOptions.some((area) => area.id === catalogForms.extruderAreaId)) {
      setCatalogForms((prev) => ({ ...prev, extruderAreaId: areaOptions[0]?.id || 'extrudovna_i' }));
    }
  }, [areaOptions, catalogForms.extruderAreaId]);

  // Stats
  const extrusionStats = useMemo(() => ({
    total: batches.length,
    planned: batches.filter(b => b.status === 'planned').length,
    running: batches.filter(b => b.status === 'running').length,
    done: batches.filter(b => b.status === 'done').length,
  }), [batches]);

  const packagingStats = useMemo(() => ({
    total: orders.length,
    planned: orders.filter(o => o.status === 'planned').length,
    running: orders.filter(o => o.status === 'running').length,
    done: orders.filter(o => o.status === 'done').length,
  }), [orders]);

  const weekTimeline = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = localDateKey(date);
      const dayBatches = batches.filter((batch) => batch.planDate === key);
      return {
        key,
        date,
        total: dayBatches.length,
        running: dayBatches.filter((batch) => batch.status === 'running').length,
        planned: dayBatches.filter((batch) => batch.status === 'planned').length,
        done: dayBatches.filter((batch) => batch.status === 'done').length,
      };
    });
  }, [batches]);

  const todayKey = localDateKey();
  const runningExtrusionBatches = useMemo(
    () => batches.filter((batch) => batch.status === 'running'),
    [batches]
  );
  const todayPlannedBatches = useMemo(
    () => batches.filter((batch) => batch.planDate === todayKey && batch.status !== 'done'),
    [batches, todayKey]
  );
  const extrusionAreaSummary = useMemo(() => areaOptions.map((area) => {
    const areaBatches = batches.filter((batch) => batch.productionArea === area.id);
    return {
      area,
      total: areaBatches.length,
      today: areaBatches.filter((batch) => batch.planDate === todayKey && batch.status !== 'done').length,
      running: areaBatches.filter((batch) => batch.status === 'running').length,
      planned: areaBatches.filter((batch) => batch.status === 'planned').length,
    };
  }), [areaOptions, batches, todayKey]);

  // ── Extrusion actions ──
  const createCatalogItem = async (kind: 'material' | 'area' | 'extruder') => {
    if (!canManage) return;
    const userId = user?.uid || user?.id || '';
    const userName = user?.displayName || 'Neznámý';
    const base = {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdById: userId,
      createdByName: userName,
    };

    try {
      if (kind === 'material') {
        const name = catalogForms.material.trim();
        if (!name) return;
        await addDoc(collection(db, 'production_materials'), { ...base, name });
        setCatalogForms((prev) => ({ ...prev, material: '' }));
        showToast('Surovina přidána', 'success');
        return;
      }

      if (kind === 'area') {
        const name = catalogForms.area.trim();
        if (!name) return;
        await addDoc(collection(db, 'production_areas'), { ...base, name });
        setCatalogForms((prev) => ({ ...prev, area: '' }));
        showToast('Extrudovna přidána', 'success');
        return;
      }

      const name = catalogForms.extruder.trim();
      const area = areaOptions.find((item) => item.id === catalogForms.extruderAreaId) || areaOptions[0];
      if (!name || !area) return;
      await addDoc(collection(db, 'production_extruders'), {
        ...base,
        name,
        areaId: area.id,
        areaName: area.name,
      });
      setCatalogForms((prev) => ({ ...prev, extruder: '' }));
      showToast('Extruder přidán', 'success');
    } catch {
      showToast('Číselník se nepodařilo uložit', 'error');
    }
  };

  const createBatch = async () => {
    if ((!batchForm.rawMaterial && !selectedMaterial) || !batchForm.targetWeight) return;
    const selectedLines = batchForm.extruderIds
      .map((id) => extrusionLineOptions.find((line) => line.id === id))
      .filter((line): line is ProductionExtruderOption => Boolean(line));
    const safeLines = selectedLines.length ? selectedLines : [visibleExtrusionLines[0] || extrusionLineOptions[0]].filter(Boolean) as ProductionExtruderOption[];
    const selectedLine = safeLines[0];
    const resolvedMachines = safeLines.map((line) => ({
      line,
      asset: findRealExtruderAsset(line, allAssets),
    }));
    const machineIds = resolvedMachines.map((item) => item.asset?.id || item.line.id).filter(Boolean);
    const machineNames = resolvedMachines.map((item) => item.asset?.name || item.line.name).filter(Boolean);
    const rawMaterial = selectedMaterial?.name || batchForm.rawMaterial;
    setBatchSaving(true);
    try {
      const batchId = await generateBatchId(machineIds[0] || selectedLine?.id || batchForm.productionArea);
      await addDoc(collection(db, 'production_extrusion'), {
        batchId,
        planDate: batchForm.planDate || localDateKey(),
        productionArea: selectedLine?.areaId || batchForm.productionArea,
        productionAreaLabel: selectedLine?.areaName || areaOptions.find((area) => area.id === batchForm.productionArea)?.name || '',
        rawMaterial,
        productId: selectedProduct?.id || '',
        productName: selectedProduct?.name || '',
        productBatch: selectedProductBatch,
        materialId: selectedMaterial?.id || '',
        materialName: selectedMaterial?.name || '',
        materialBatch: selectedMaterialBatch,
        mixingRecipeSnapshot,
        mixingNote: batchForm.mixingNote.trim(),
        targetMotorLoadAmps: selectedProduct?.targetMotorLoadAmps ?? null,
        targetWeight: Number(batchForm.targetWeight),
        machineId: machineIds[0] || '',
        machineName: machineNames[0] || '',
        machineIds,
        machineNames,
        machineCatalogId: selectedLine?.id || '',
        machineCatalogIds: safeLines.map((line) => line.id),
        note: batchForm.note.trim(),
        status: 'planned',
        shiftLog: '',
        startedAt: null,
        completedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdById: user?.uid || user?.id || '',
        createdByName: user?.displayName || 'Neznámý',
      });
      setShowNewBatch(false);
      setBatchForm({
        planDate: localDateKey(),
        productionArea: areaOptions[0]?.id || 'extrudovna_i',
        extruderId: extrusionLineOptions[0]?.id || '',
        extruderIds: extrusionLineOptions[0]?.id ? [extrusionLineOptions[0].id] : [],
        productId: '',
        materialId: '',
        productBatchDate: localDateKey(),
        materialBatchDate: localDateKey(),
        materialBatchSuffix: 'A',
        materialBatchOverride: '',
        rawMaterial: '',
        targetWeight: '',
        mixingNote: '',
        note: '',
      });
      showToast('Dávka vytvořena', 'success');
    } catch { showToast('Chyba při vytváření', 'error'); }
    setBatchSaving(false);
  };

  const startBatch = async (id: string) => {
    await updateDoc(doc(db, 'production_extrusion', id), { status: 'running', startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    showToast('Extruze spuštěna', 'success');
  };

  const stopBatch = async (id: string) => {
    await updateDoc(doc(db, 'production_extrusion', id), { status: 'done', completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    showToast('Extruze dokončena', 'success');
  };

  const saveShiftLog = async () => {
    if (!shiftLogId || !shiftLogText.trim()) return;
    await updateDoc(doc(db, 'production_extrusion', shiftLogId), { shiftLog: shiftLogText.trim(), updatedAt: serverTimestamp() });
    setShiftLogId(null);
    setShiftLogText('');
    showToast('Směnový záznam uložen', 'success');
  };

  // ── Packaging actions ──
  const createOrder = async () => {
    if (!orderForm.packagingType || !orderForm.palletCount) return;
    setOrderSaving(true);
    try {
      const productId = await generateProductId(orderForm.lineId || orderForm.lineName || orderForm.packagingType);
      await addDoc(collection(db, 'production_packaging'), {
        productId,
        packagingType: orderForm.packagingType,
        palletCount: Number(orderForm.palletCount),
        lineId: orderForm.lineId,
        lineName: orderForm.lineName,
        deadline: orderForm.deadline,
        status: 'planned',
        startedAt: null,
        completedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdById: user?.uid || user?.id || '',
        createdByName: user?.displayName || 'Neznámý',
      });
      setShowNewOrder(false);
      setOrderForm({ packagingType: '', palletCount: '', lineId: '', lineName: '', deadline: '' });
      showToast('Balicí zakázka vytvořena', 'success');
    } catch { showToast('Chyba při vytváření', 'error'); }
    setOrderSaving(false);
  };

  const startOrder = async (id: string) => {
    await updateDoc(doc(db, 'production_packaging', id), { status: 'running', startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    showToast('Balení spuštěno', 'success');
  };

  const stopOrder = async (id: string) => {
    await updateDoc(doc(db, 'production_packaging', id), { status: 'done', completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    showToast('Balení dokončeno', 'success');
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const loading = activeTab === 'extrusion' ? loadingBatches : loadingOrders;
  const stats = activeTab === 'extrusion' ? extrusionStats : packagingStats;

  return (
    <div className="min-h-screen bg-[#f1ece3] pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => goBack()} className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Výroba</h1>
              <p className="text-xs text-slate-500">Plánování extruze & balení</p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => activeTab === 'extrusion' ? setShowNewBatch(true) : setShowNewOrder(true)}
              className="px-3 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-500 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{activeTab === 'extrusion' ? 'Nová dávka' : 'Nová zakázka'}</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
          {[
            { id: 'extrusion' as const, label: 'Extrudovna', icon: Cog, count: extrusionStats.running },
            { id: 'packaging' as const, label: 'Balení', icon: Package, count: packagingStats.running },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-slate-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.id ? 'bg-amber-200 text-amber-800' : 'bg-amber-500/20 text-amber-700'
                }`}>
                  {tab.count} ▶
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {[
            { value: stats.total, label: 'Celkem', color: '#94a3b8' },
            { value: stats.planned, label: 'Plánováno', color: '#60a5fa' },
            { value: stats.running, label: 'Probíhá', color: '#fbbf24' },
            { value: stats.done, label: 'Hotovo', color: '#34d399' },
          ].map(s => (
            <div key={s.label} className="text-center py-2 px-1 rounded-xl" style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}>
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {activeTab === 'extrusion' && (
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Dnešní provoz</div>
                <div className="text-sm font-bold text-slate-900">Co běží a co čeká</div>
              </div>
              <div className="rounded-full bg-[#fbf9f4]/45 px-3 py-1 text-xs font-black text-slate-600">
                {new Date().toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-amber-700">Právě běží</div>
                {runningExtrusionBatches.length === 0 ? (
                  <div className="text-sm font-semibold text-slate-400">Nic neběží</div>
                ) : (
                  <div className="space-y-2">
                    {runningExtrusionBatches.slice(0, 3).map((batch) => (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => {
                          setPlanDateFilter(batch.planDate || 'ALL');
                          const filterId = getBatchMachineFilterIds(batch)[0];
                          if (filterId) setMachineFilter(filterId);
                        }}
                        className="block w-full rounded-lg bg-[#fbf9f4]/35 px-2.5 py-2 text-left transition hover:bg-white"
                      >
                        <div className="truncate text-sm font-black text-slate-900">{batch.productName || batch.materialName || batch.rawMaterial || 'Dávka'}</div>
                        <div className="mt-0.5 truncate text-xs font-semibold text-amber-700">{getBatchMachineLabel(batch)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-700">Dnes čeká</div>
                {todayPlannedBatches.length === 0 ? (
                  <div className="text-sm font-semibold text-slate-400">Dnes není otevřená dávka</div>
                ) : (
                  <div className="space-y-2">
                    {todayPlannedBatches.slice(0, 3).map((batch) => (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => {
                          setPlanDateFilter(batch.planDate || 'ALL');
                          const filterId = getBatchMachineFilterIds(batch)[0];
                          if (filterId) setMachineFilter(filterId);
                        }}
                        className="block w-full rounded-lg bg-[#fbf9f4]/35 px-2.5 py-2 text-left transition hover:bg-white"
                      >
                        <div className="truncate text-sm font-black text-slate-900">{batch.productName || batch.materialName || batch.rawMaterial || 'Dávka'}</div>
                        <div className="mt-0.5 truncate text-xs font-semibold text-blue-700">{getBatchMachineLabel(batch)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {extrusionAreaSummary.map(({ area, today, running, planned }) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => {
                    const firstLine = extrusionLineOptions.find((line) => line.areaId === area.id);
                    setMachineFilter(firstLine?.id || 'ALL');
                    setPlanDateFilter('ALL');
                  }}
                  className="rounded-xl border border-slate-200 bg-[#fbf9f4]/30 px-3 py-2 text-left transition hover:bg-[#fbf9f4]/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-black text-slate-900">{area.name}</div>
                    <div className="text-xs font-black text-slate-600">{today} dnes</div>
                  </div>
                  <div className="mt-1 flex gap-2 text-[11px] font-bold text-slate-400">
                    <span className="text-amber-700">{running} běží</span>
                    <span className="text-blue-700">{planned} plán</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Machine filter (extrusion only) */}
      {activeTab === 'extrusion' && (
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            <button
              onClick={() => setMachineFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                machineFilter === 'ALL' ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-400'
              }`}
            >
              Všechny stroje
            </button>
            {extrusionLineOptions.map(a => (
              <button
                key={a.id}
                onClick={() => setMachineFilter(a.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  machineFilter === a.id ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-400'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        )}

        {/* ═══ EXTRUSION TAB ═══ */}
        {activeTab === 'extrusion' && !loadingBatches && (() => {
          const byMachine = machineFilter === 'ALL' ? batches : batches.filter(b => getBatchMachineFilterIds(b).includes(machineFilter));
          const filtered = planDateFilter === 'ALL' ? byMachine : byMachine.filter((batch) => batch.planDate === planDateFilter);
          return (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400">Týdenní plán</div>
                  <div className="text-sm font-bold text-slate-900">Extruze po dnech</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanDateFilter('ALL')}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    planDateFilter === 'ALL'
                      ? 'bg-white text-slate-950'
                      : 'bg-[#fbf9f4]/45 text-slate-600 hover:bg-white'
                  }`}
                >
                  Všechny dny
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {weekTimeline.map((day) => {
                  const isToday = day.key === localDateKey();
                  const isSelected = planDateFilter === day.key;
                  return (
                    <button
                      type="button"
                      onClick={() => setPlanDateFilter(day.key)}
                      key={day.key}
                      className={`min-h-[74px] rounded-xl border p-2 text-left transition active:scale-[0.98] ${
                        isSelected ? 'border-white bg-white text-slate-950' :
                        isToday ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-slate-200 bg-[#fbf9f4]/35 hover:bg-white'
                      }`}
                    >
                      <div className={`text-[10px] font-bold uppercase ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>
                        {day.date.toLocaleDateString('cs-CZ', { weekday: 'short' })}
                      </div>
                      <div className={`text-sm font-black ${isSelected ? 'text-slate-950' : isToday ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {day.date.getDate()}. {day.date.getMonth() + 1}.
                      </div>
                      <div className={`mt-2 text-lg font-black ${isSelected ? 'text-slate-950' : 'text-slate-900'}`}>{day.total}</div>
                      <div className="mt-1 flex gap-1">
                        {day.running > 0 && <span className="h-1.5 flex-1 rounded-full bg-amber-400" />}
                        {day.planned > 0 && <span className="h-1.5 flex-1 rounded-full bg-blue-400" />}
                        {day.done > 0 && <span className="h-1.5 flex-1 rounded-full bg-emerald-400" />}
                        {day.total === 0 && <span className={`h-1.5 flex-1 rounded-full ${isSelected ? 'bg-slate-300' : 'bg-slate-100'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {filtered.length === 0 && (
              <EmptyBlock icon={<Cog className="w-14 h-14 text-slate-600" />} text={machineFilter === 'ALL' ? 'Žádné dávky' : 'Žádné dávky pro tento stroj'} sub="Vytvořte první extruzní dávku" />
            )}
            {filtered.map(batch => {
              const st = STATUS_CFG[batch.status];
              const machineLabel = getBatchMachineLabel(batch);
              return (
                <div key={batch.id} className={`bg-white rounded-2xl border ${
                  batch.status === 'running' ? 'border-amber-500/30 ring-1 ring-amber-500/20' :
                  batch.status === 'done' ? 'border-emerald-500/20 opacity-70' : 'border-slate-200'
                } overflow-hidden`}>
                  {/* Card header */}
                  <div className={`px-4 py-2.5 ${st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                      <span className={`text-xs font-bold ${st.text}`}>{st.label}</span>
                      <span className="text-xs text-slate-500 font-mono">{batch.batchId}</span>
                    </div>
                    {batch.status === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
                        <Clock className="w-3 h-3" />
                        {formatDuration(batch.startedAt, null)}
                      </span>
                    )}
                    {batch.status === 'done' && batch.startedAt && (
                      <span className="flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatDuration(batch.startedAt, batch.completedAt)}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <button
                    type="button"
                    onClick={() => setSelectedBatch(batch)}
                    className="block w-full px-4 py-3 text-left transition hover:bg-[#fbf9f4]/20"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-slate-900">{batch.productName || batch.materialName || batch.rawMaterial || 'Bez výrobku'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                          <span className="rounded-full bg-slate-50 px-2.5 py-1">{batch.productionAreaLabel}</span>
                          <span className="rounded-full bg-slate-50 px-2.5 py-1">{machineLabel}</span>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-xl border border-slate-200 bg-[#fbf9f4]/35 px-3 py-2 text-right">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Plán</div>
                        <div className="text-sm font-black text-slate-900">{batch.planDate || 'Bez data'}</div>
                      </div>
                    </div>
                    <div className="mb-3 divide-y divide-stone-100 border-y border-stone-100">
                      <div className="flex items-start justify-between gap-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Výrobek</span>
                        <span className="min-w-0 text-right text-sm font-medium text-slate-900">
                          {batch.productName || 'nezadáno'}
                          {batch.productBatch && <span className="ml-2 font-mono text-[11px] text-emerald-700">{batch.productBatch}</span>}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Surovina</span>
                        <span className="min-w-0 text-right text-sm font-medium text-slate-900">
                          {batch.materialName || batch.rawMaterial}
                          {batch.materialBatch && <span className="ml-2 font-mono text-[11px] text-emerald-700">{batch.materialBatch}</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Hmotnost</span>
                        <span className="text-right text-sm font-medium text-slate-900">{batch.targetWeight} kg</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Stroj</span>
                        <span className="text-right text-sm font-medium text-slate-900">{machineLabel}</span>
                      </div>
                    </div>

                    {(batch.mixingRecipeSnapshot?.length || batch.mixingNote || typeof batch.targetMotorLoadAmps === 'number') && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 mb-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Míchání podle receptury</div>
                          {typeof batch.targetMotorLoadAmps === 'number' && (
                            <div className="rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] font-black text-emerald-700">cíl {batch.targetMotorLoadAmps} A</div>
                          )}
                        </div>
                        {!!batch.mixingRecipeSnapshot?.length && (
                          <div className="space-y-1">
                            {batch.mixingRecipeSnapshot.map((row, index) => (
                              <div key={`${row.materialId}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                                <span className="font-semibold text-slate-900">{row.materialName}</span>
                                <span className="text-slate-600">{row.ratio} dílů</span>
                                <span className="font-bold text-emerald-700">{row.plannedAmountKg || '—'} kg</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {batch.mixingNote && <p className="mt-2 text-xs text-emerald-700 whitespace-pre-wrap">{batch.mixingNote}</p>}
                      </div>
                    )}

                    {batch.note && (
                      <div className="bg-slate-50 rounded-xl p-2.5 mb-3">
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Poznámka k plánu</div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{batch.note}</p>
                      </div>
                    )}

                    {/* Shift log */}
                    {batch.shiftLog && (
                      <div className="bg-slate-50 rounded-xl p-2.5 mb-3">
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Směnový záznam</div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{batch.shiftLog}</p>
                      </div>
                    )}
                  </button>

                    {/* Actions */}
                    {canManage && (
                      <div className="flex gap-2 px-4 pb-3">
                        {batch.status === 'planned' && (
                          <button onClick={(event) => { event.stopPropagation(); startBatch(batch.id); }}
                            className="flex-1 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/25 transition active:scale-[0.97]">
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        )}
                        {batch.status === 'running' && (
                          <button onClick={(event) => { event.stopPropagation(); stopBatch(batch.id); }}
                            className="flex-1 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 transition active:scale-[0.97]">
                            <Square className="w-3.5 h-3.5" /> Dokončit
                          </button>
                        )}
                        {batch.status !== 'done' && (
                          <button onClick={(event) => { event.stopPropagation(); setShiftLogId(batch.id); setShiftLogText(batch.shiftLog || ''); }}
                            className="py-2.5 px-3 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl text-xs font-semibold hover:text-slate-900 transition">
                            Záznam
                          </button>
                        )}
                      </div>
                    )}

                  {/* Footer */}
                  <div className="px-4 pb-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{batch.createdByName}</span>
                    <span>·</span>
                    <span>{formatDate(batch.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
          );
        })()}

        {/* ═══ PACKAGING TAB ═══ */}
        {activeTab === 'packaging' && !loadingOrders && (
          <>
            {orders.length === 0 && (
              <EmptyBlock icon={<Package className="w-14 h-14 text-slate-600" />} text="Žádné zakázky" sub="Vytvořte první balicí zakázku" />
            )}
            {orders.map(order => {
              const st = STATUS_CFG[order.status];
              const isOverdue = order.deadline && new Date(order.deadline) < new Date() && order.status !== 'done';
              return (
                <div key={order.id} className={`bg-white rounded-2xl border ${
                  isOverdue ? 'border-red-500/30 ring-1 ring-red-500/20' :
                  order.status === 'running' ? 'border-amber-500/30 ring-1 ring-amber-500/20' :
                  order.status === 'done' ? 'border-emerald-500/20 opacity-70' : 'border-slate-200'
                } overflow-hidden`}>
                  {/* Card header */}
                  <div className={`px-4 py-2.5 ${isOverdue ? 'bg-red-500/15' : st.bg} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${isOverdue ? 'bg-red-400 animate-pulse' : st.dot}`} />
                      <span className={`text-xs font-bold ${isOverdue ? 'text-red-700' : st.text}`}>
                        {isOverdue ? 'Po termínu!' : st.label}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{order.productId}</span>
                    </div>
                    {order.status === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
                        <Clock className="w-3 h-3" />
                        {formatDuration(order.startedAt, null)}
                      </span>
                    )}
                    {order.status === 'done' && order.startedAt && (
                      <span className="flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatDuration(order.startedAt, order.completedAt)}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Balení</div>
                        <div className="text-sm font-medium text-slate-900">{order.packagingType}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Palet</div>
                        <div className="text-sm font-medium text-slate-900">{order.palletCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Linka</div>
                        <div className="text-sm font-medium text-slate-900">{order.lineName || '—'}</div>
                      </div>
                    </div>

                    {order.deadline && (
                      <div className={`flex items-center gap-1.5 mb-3 text-xs font-medium ${isOverdue ? 'text-red-700' : 'text-slate-400'}`}>
                        {isOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
                        <Clock className="w-3.5 h-3.5" />
                        Deadline: {new Date(order.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}

                    {/* Actions */}
                    {canManage && (
                      <div className="flex gap-2">
                        {order.status === 'planned' && (
                          <button onClick={() => startOrder(order.id)}
                            className="flex-1 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/25 transition active:scale-[0.97]">
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        )}
                        {order.status === 'running' && (
                          <button onClick={() => stopOrder(order.id)}
                            className="flex-1 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 transition active:scale-[0.97]">
                            <Square className="w-3.5 h-3.5" /> Dokončit
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 pb-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{order.createdByName}</span>
                    <span>·</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ═══ NEW EXTRUSION BATCH MODAL ═══ */}
      {showNewBatch && (
        <ModalShell title="Nová extruzní dávka" icon={<Cog className="w-5 h-5 text-orange-700" />} onClose={() => setShowNewBatch(false)}>
          <div className="space-y-4">
            <Field label="Datum plánu">
              <input type="date" value={batchForm.planDate}
                onChange={e => setBatchForm(p => ({ ...p, planDate: e.target.value }))}
                className={INP_CLS} />
            </Field>
            <Field label="Extrudovna">
              <div className="grid grid-cols-2 gap-2">
                {areaOptions.map(area => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => setBatchForm(p => ({ ...p, productionArea: area.id }))}
                    className={`rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                      batchForm.productionArea === area.id
                        ? 'border-orange-400 bg-orange-500/20 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-sm font-bold">{area.name}</span>
                    <span className="mt-1 block text-xs opacity-75">
                      {extrusionLineOptions.filter((line) => line.areaId === area.id).length} extruderů
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Extruder">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-400">
                  Vyber jeden nebo oba extrudery, pokud jedou do stejné násypky.
                </p>
                {visibleExtrusionLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = visibleExtrusionLines.map((line) => line.id);
                      setBatchForm((prev) => ({ ...prev, extruderIds: ids, extruderId: ids[0] || '' }));
                    }}
                    className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-700"
                  >
                    Vybrat vše
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {visibleExtrusionLines.map(line => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => setBatchForm((prev) => {
                      const exists = prev.extruderIds.includes(line.id);
                      const next = exists
                        ? prev.extruderIds.filter((id) => id !== line.id)
                        : [...prev.extruderIds, line.id];
                      const safeNext = next.length ? next : [line.id];
                      return { ...prev, extruderIds: safeNext, extruderId: safeNext[0] || '' };
                    })}
                    className={`rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                      batchForm.extruderIds.includes(line.id)
                        ? 'border-emerald-400 bg-emerald-500/20 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-bold">
                      {line.name}
                      {batchForm.extruderIds.includes(line.id) && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs opacity-75">{line.areaName}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Výrobek">
              <select
                value={batchForm.productId}
                onChange={e => setBatchForm(p => ({ ...p, productId: e.target.value }))}
                className={SEL_CLS}
                style={{ appearance: 'auto' }}
              >
                <option value="" className="bg-white">— vybrat výrobek —</option>
                {masterProducts.map(product => (
                  <option key={product.id} value={product.id} className="bg-white">
                    {product.nkCode} — {product.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Datum šarže výrobku">
                <input
                  type="date"
                  value={batchForm.productBatchDate}
                  onChange={e => setBatchForm(p => ({ ...p, productBatchDate: e.target.value }))}
                  className={INP_CLS}
                />
              </Field>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-[10px] font-black uppercase text-emerald-700">Auto šarže výrobku</div>
                <div className="mt-1 font-mono text-sm font-black text-slate-900">{selectedProductBatch || 'vyber výrobek'}</div>
              </div>
            </div>
            <Field label="Surovina">
              <select
                value={batchForm.materialId}
                onChange={e => setBatchForm(p => ({ ...p, materialId: e.target.value, rawMaterial: '' }))}
                className={SEL_CLS}
                style={{ appearance: 'auto' }}
              >
                <option value="" className="bg-white">— vybrat surovinu —</option>
                {masterMaterials.map(material => (
                  <option key={material.id} value={material.id} className="bg-white">
                    {material.nkCode} — {material.name}
                  </option>
                ))}
              </select>
            </Field>
            {masterMaterials.length === 0 && (
              <Field label="Surovina (dočasný číselník)">
                <select value={batchForm.rawMaterial} onChange={e => setBatchForm(p => ({ ...p, rawMaterial: e.target.value }))}
                  className={SEL_CLS} style={{ appearance: 'auto' }}>
                  <option value="" className="bg-white">— vybrat —</option>
                  {materialOptions.map(m => <option key={m.id} value={m.name} className="bg-white">{m.name}</option>)}
                </select>
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
              <Field label="Datum naskladnění suroviny">
                <input
                  type="date"
                  value={batchForm.materialBatchDate}
                  onChange={e => setBatchForm(p => ({ ...p, materialBatchDate: e.target.value }))}
                  className={INP_CLS}
                />
              </Field>
              <Field label="A/B/C">
                <input
                  value={batchForm.materialBatchSuffix}
                  onChange={e => setBatchForm(p => ({ ...p, materialBatchSuffix: e.target.value.toUpperCase().slice(0, 2) }))}
                  className={INP_CLS}
                  placeholder="A"
                />
              </Field>
            </div>
            <Field label="Šarže suroviny">
              <input
                value={batchForm.materialBatchOverride}
                onChange={e => setBatchForm(p => ({ ...p, materialBatchOverride: e.target.value }))}
                placeholder={selectedMaterialBatch || 'auto podle suroviny a data'}
                className={INP_CLS}
              />
            </Field>
            {canManage && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowCatalogSettings((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">Nastavení seznamů</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-400">
                      Volitelné: suroviny, úseky a stroje pro plánování. Sem později přidáme i mlýny.
                    </span>
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-900">
                    {showCatalogSettings ? 'Sbalit' : 'Rozbalit'}
                  </span>
                </button>
                {showCatalogSettings && (
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={catalogForms.material}
                      onChange={(e) => setCatalogForms((prev) => ({ ...prev, material: e.target.value }))}
                      placeholder="Nová surovina"
                      className={INP_CLS}
                    />
                    <button
                      type="button"
                      onClick={() => createCatalogItem('material')}
                      disabled={!catalogForms.material.trim()}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      + Surovina
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={catalogForms.area}
                      onChange={(e) => setCatalogForms((prev) => ({ ...prev, area: e.target.value }))}
                      placeholder="Nový úsek / extrudovna"
                      className={INP_CLS}
                    />
                    <button
                      type="button"
                      onClick={() => createCatalogItem('area')}
                      disabled={!catalogForms.area.trim()}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      + Úsek
                    </button>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[1fr_180px_auto]">
                    <input
                      value={catalogForms.extruder}
                      onChange={(e) => setCatalogForms((prev) => ({ ...prev, extruder: e.target.value }))}
                      placeholder="Nový stroj / linka"
                      className={INP_CLS}
                    />
                    <select
                      value={catalogForms.extruderAreaId}
                      onChange={(e) => setCatalogForms((prev) => ({ ...prev, extruderAreaId: e.target.value }))}
                      className={SEL_CLS}
                      style={{ appearance: 'auto' }}
                    >
                      {areaOptions.map((area) => (
                        <option key={area.id} value={area.id} className="bg-white">{area.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => createCatalogItem('extruder')}
                      disabled={!catalogForms.extruder.trim()}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      + Stroj
                    </button>
                  </div>
                </div>
                )}
              </div>
            )}
            <Field label="Cílová hmotnost (kg)">
              <input type="number" min="0" value={batchForm.targetWeight}
                onChange={e => setBatchForm(p => ({ ...p, targetWeight: e.target.value }))}
                placeholder="500" className={INP_CLS} />
            </Field>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Míchání / receptura</div>
                {typeof selectedProduct?.targetMotorLoadAmps === 'number' && (
                  <div className="rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] font-black text-emerald-700">
                    zátěž {selectedProduct.targetMotorLoadAmps} A
                  </div>
                )}
              </div>
              {selectedProduct?.recipe?.length ? (
                <div className="space-y-1">
                  {mixingRecipeSnapshot.map((row, index) => (
                    <div key={`${row.materialId}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                      <span className="font-semibold text-slate-900">{row.materialName}</span>
                      <span className="text-slate-600">{row.ratio} dílů</span>
                      <span className="font-bold text-emerald-700">{row.plannedAmountKg || '—'} kg</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-amber-700">Receptura není vyplněná v rodném listu výrobku.</p>
              )}
            </div>
            <Field label="Poznámka k míchání">
              <input
                value={batchForm.mixingNote}
                onChange={e => setBatchForm(p => ({ ...p, mixingNote: e.target.value }))}
                placeholder="např. míchat 20 min, kontrola vody, zvláštní postup..."
                className={INP_CLS}
              />
            </Field>
            <Field label="Poznámka pro operátory">
              <textarea
                value={batchForm.note}
                onChange={e => setBatchForm(p => ({ ...p, note: e.target.value }))}
                placeholder="Např. priorita, změna směsi, upozornění..."
                rows={3}
                className={INP_CLS + ' resize-none'}
              />
            </Field>
            <button onClick={createBatch} disabled={(!batchForm.rawMaterial && !selectedMaterial) || !batchForm.targetWeight || batchSaving}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {batchSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {batchSaving ? 'Ukládám...' : 'Vytvořit dávku'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══ NEW PACKAGING ORDER MODAL ═══ */}
      {showNewOrder && (
        <ModalShell title="Nová balicí zakázka" icon={<Package className="w-5 h-5 text-blue-700" />} onClose={() => setShowNewOrder(false)}>
          <div className="space-y-4">
            <Field label="Typ balení">
              <select value={orderForm.packagingType} onChange={e => setOrderForm(p => ({ ...p, packagingType: e.target.value }))}
                className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-white">— vybrat —</option>
                {PACKAGING_TYPES.map(t => <option key={t} value={t} className="bg-white">{t}</option>)}
              </select>
            </Field>
            <Field label="Počet palet">
              <input type="number" min="1" value={orderForm.palletCount}
                onChange={e => setOrderForm(p => ({ ...p, palletCount: e.target.value }))}
                placeholder="10" className={INP_CLS} />
            </Field>
            <Field label="Balicí linka">
              <select value={orderForm.lineId} onChange={e => {
                const asset = packagingOptions.find(a => a.id === e.target.value);
                setOrderForm(p => ({ ...p, lineId: e.target.value, lineName: asset?.name || '' }));
              }} className={SEL_CLS} style={{ appearance: 'auto' }}>
                <option value="" className="bg-white">— vybrat linku —</option>
                {packagingOptions.map(a => <option key={a.id} value={a.id} className="bg-white">{a.name}{a.code ? ` (${a.code})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Deadline">
              <input type="date" value={orderForm.deadline}
                onChange={e => setOrderForm(p => ({ ...p, deadline: e.target.value }))}
                className={INP_CLS} />
            </Field>
            <button onClick={createOrder} disabled={!orderForm.packagingType || !orderForm.palletCount || orderSaving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              {orderSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {orderSaving ? 'Ukládám...' : 'Vytvořit zakázku'}
            </button>
          </div>
        </ModalShell>
      )}

      {selectedBatch && (
        <ModalShell
          title="Detail dávky"
          icon={<Cog className="w-5 h-5 text-amber-700" />}
          onClose={() => setSelectedBatch(null)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-[#fbf9f4]/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">{selectedBatch.batchId}</div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">{selectedBatch.productName || selectedBatch.materialName || selectedBatch.rawMaterial || 'Bez výrobku'}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{getBatchMachineLabel(selectedBatch)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${STATUS_CFG[selectedBatch.status]?.bg || 'bg-slate-100'} ${STATUS_CFG[selectedBatch.status]?.text || 'text-slate-900'}`}>
                  {STATUS_CFG[selectedBatch.status]?.label || selectedBatch.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Extrudovna</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedBatch.productionAreaLabel}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Plán</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedBatch.planDate || 'Bez data'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Hmotnost</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedBatch.targetWeight} kg</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Cílová zátěž</div>
                <div className="mt-1 text-sm font-black text-slate-900">
                  {typeof selectedBatch.targetMotorLoadAmps === 'number' ? `${selectedBatch.targetMotorLoadAmps} A` : 'Nezadáno'}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Výrobek / šarže</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedBatch.productName || 'Nezadáno'}</div>
                <div className="mt-1 font-mono text-xs font-bold text-emerald-700">{selectedBatch.productBatch || 'bez šarže'}</div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">Surovina / šarže</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedBatch.materialName || selectedBatch.rawMaterial || 'Nezadáno'}</div>
                <div className="mt-1 font-mono text-xs font-bold text-blue-700">{selectedBatch.materialBatch || 'bez šarže'}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-emerald-700">Receptura / míchání</div>
              {selectedBatch.mixingRecipeSnapshot?.length ? (
                <div className="space-y-1.5">
                  {selectedBatch.mixingRecipeSnapshot.map((row, index) => (
                    <div key={`${row.materialId}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
                      <span className="font-black text-slate-900">{row.materialName}</span>
                      <span className="font-semibold text-slate-600">{row.ratio} dílů</span>
                      <span className="font-black text-emerald-700">{row.plannedAmountKg || '—'} kg</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-400">Receptura není uložená u dávky.</div>
              )}
              {selectedBatch.mixingNote && <p className="mt-2 text-sm text-emerald-700 whitespace-pre-wrap">{selectedBatch.mixingNote}</p>}
            </div>

            {(selectedBatch.note || selectedBatch.shiftLog) && (
              <div className="space-y-2">
                {selectedBatch.note && (
                  <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Poznámka k plánu</div>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{selectedBatch.note}</p>
                  </div>
                )}
                {selectedBatch.shiftLog && (
                  <div className="rounded-xl border border-slate-200 bg-[#fbf9f4]/35 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Směnový záznam</div>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{selectedBatch.shiftLog}</p>
                  </div>
                )}
              </div>
            )}

            {canManage && selectedBatch.status !== 'done' && (
              <div className="grid gap-2 sm:grid-cols-3">
                {selectedBatch.status === 'planned' && (
                  <button
                    onClick={() => { startBatch(selectedBatch.id); setSelectedBatch(null); }}
                    className="py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-700 font-black flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Start
                  </button>
                )}
                {selectedBatch.status === 'running' && (
                  <button
                    onClick={() => { stopBatch(selectedBatch.id); setSelectedBatch(null); }}
                    className="py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 font-black flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4" /> Dokončit
                  </button>
                )}
                <button
                  onClick={() => {
                    setShiftLogId(selectedBatch.id);
                    setShiftLogText(selectedBatch.shiftLog || '');
                    setSelectedBatch(null);
                  }}
                  className="py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-black flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4" /> Záznam směny
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* ═══ SHIFT LOG MODAL ═══ */}
      {shiftLogId && (
        <ModalShell title="Směnový záznam" icon={<Clock className="w-5 h-5 text-slate-400" />} onClose={() => setShiftLogId(null)}>
          <div className="space-y-4">
            <div className="flex gap-2 items-start">
              <textarea
                value={shiftLogText}
                onChange={e => setShiftLogText(e.target.value)}
                placeholder="Poznámky k extruzi — teplota, vlhkost, problémy..."
                rows={5}
                autoFocus
                className={INP_CLS + ' resize-none'}
              />
              <div className="pt-2">
                <MicButton onTranscript={t => setShiftLogText(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>
            <button onClick={saveShiftLog} disabled={!shiftLogText.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-slate-500 to-slate-600 text-slate-900 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]">
              Uložit záznam
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ═══════════════════════════════════════════════════════════════════

const INP_CLS = 'w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-orange-500/50 transition';
const SEL_CLS = INP_CLS;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function EmptyBlock({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="text-center py-16">
      {icon}
      <h3 className="text-lg font-bold text-slate-900 mt-3 mb-1">{text}</h3>
      <p className="text-slate-500 text-sm">{sub}</p>
    </div>
  );
}

function ModalShell({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

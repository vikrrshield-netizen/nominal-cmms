import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  ProductionMachineRecipeDoc,
  ProductionMachineRecipeStatus,
  ProductionRecipeItem,
  SaveProductionMachineRecipeInput,
} from '../types/production';

const COLLECTION = 'production_machine_recipes';
const ACTIVE_STATUSES: ProductionMachineRecipeStatus[] = ['draft', 'active'];

const stripUnsafeIdChars = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

export function productionMachineRecipeId(machineId: string, productId: string): string {
  return `${stripUnsafeIdChars(machineId)}__${stripUnsafeIdChars(productId)}`;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function normalizeRecipe(value: unknown): ProductionRecipeItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((row) => {
      const item = row as Partial<ProductionRecipeItem>;
      return {
        materialId: String(item.materialId || ''),
        materialName: String(item.materialName || ''),
        ratio: Number(item.ratio || 0),
      };
    })
    .filter((row) => row.materialName && row.ratio > 0);
  return rows.length ? rows : undefined;
}

function normalizeStatus(value: unknown): ProductionMachineRecipeStatus {
  return value === 'active' || value === 'archived' || value === 'draft' ? value : 'draft';
}

function fromDoc(id: string, data: DocumentData): ProductionMachineRecipeDoc {
  return {
    id,
    machineId: String(data.machineId || ''),
    machineName: String(data.machineName || ''),
    productId: String(data.productId || ''),
    productName: String(data.productName || ''),
    productNumber: String(data.productNumber || ''),
    status: normalizeStatus(data.status),
    recipe: normalizeRecipe(data.recipe),
    note: typeof data.note === 'string' ? data.note : '',
    createdAt: toDate(data.createdAt),
    createdById: typeof data.createdById === 'string' ? data.createdById : '',
    createdByName: typeof data.createdByName === 'string' ? data.createdByName : '',
    updatedAt: toDate(data.updatedAt),
    updatedById: typeof data.updatedById === 'string' ? data.updatedById : '',
    updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : '',
  };
}

function subscribeWithConstraints(
  constraints: QueryConstraint[],
  onChange: (items: ProductionMachineRecipeDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COLLECTION), ...constraints);
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((item) => fromDoc(item.id, item.data()))),
    (error) => onError?.(error),
  );
}

export function subscribeProductionMachineRecipes(
  onChange: (items: ProductionMachineRecipeDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribeWithConstraints([orderBy('updatedAt', 'desc')], onChange, onError);
}

export function subscribeRecipesForMachine(
  machineId: string,
  onChange: (items: ProductionMachineRecipeDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribeWithConstraints(
    [where('machineId', '==', machineId), orderBy('productName', 'asc')],
    onChange,
    onError,
  );
}

export function subscribeAvailableRecipesForMachine(
  machineId: string,
  onChange: (items: ProductionMachineRecipeDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribeWithConstraints(
    [where('machineId', '==', machineId), where('status', 'in', ACTIVE_STATUSES), orderBy('productName', 'asc')],
    onChange,
    onError,
  );
}

export function subscribeRecipesForProduct(
  productId: string,
  onChange: (items: ProductionMachineRecipeDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribeWithConstraints(
    [where('productId', '==', productId), orderBy('machineName', 'asc')],
    onChange,
    onError,
  );
}

export async function saveProductionMachineRecipe(input: SaveProductionMachineRecipeInput): Promise<string> {
  const id = productionMachineRecipeId(input.machineId, input.productId);
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  const userId = input.user?.uid || input.user?.id || '';
  const userName = input.user?.displayName || '';

  const payload = {
    machineId: input.machineId,
    machineName: input.machineName,
    productId: input.productId,
    productName: input.productName,
    productNumber: input.productNumber,
    status: input.status,
    recipe: normalizeRecipe(input.recipe),
    note: input.note || '',
    updatedAt: serverTimestamp(),
    updatedById: userId,
    updatedByName: userName,
    ...(existing.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          createdById: userId,
          createdByName: userName,
        }),
  };

  await setDoc(ref, payload, { merge: true });
  return id;
}

export async function setProductionMachineRecipeStatus(
  id: string,
  status: ProductionMachineRecipeStatus,
  user?: SaveProductionMachineRecipeInput['user'],
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    updatedAt: serverTimestamp(),
    updatedById: user?.uid || user?.id || '',
    updatedByName: user?.displayName || '',
  });
}

export function resolveEffectiveRecipe(
  machineRecipe: Pick<ProductionMachineRecipeDoc, 'recipe'> | null | undefined,
  productRecipe?: ProductionRecipeItem[],
): ProductionRecipeItem[] {
  if (machineRecipe?.recipe?.length) return machineRecipe.recipe;
  return Array.isArray(productRecipe) ? productRecipe : [];
}

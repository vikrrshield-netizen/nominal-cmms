// src/utils/importers/validateExcelData.ts
// VIKRR — Asset Shield — Excel/CSV data validator
//
// Validates imported data against expected schema before Firestore write.
// Used by AI Architect and bulk import features.

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  rowCount: number;
  validRowCount: number;
}

export type FieldRule = {
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'boolean';
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  enum?: string[];
  pattern?: RegExp;
};

export type SchemaDefinition = Record<string, FieldRule>;

// ═══════════════════════════════════════════
// PREDEFINED SCHEMAS
// ═══════════════════════════════════════════

export const ASSET_SCHEMA: SchemaDefinition = {
  name: { required: true, type: 'string', maxLength: 200 },
  code: { type: 'string', maxLength: 30 },
  entityType: { type: 'string', maxLength: 50 },
  status: { type: 'string', enum: ['operational', 'maintenance', 'broken', 'stopped'] },
  criticality: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
  parentName: { type: 'string', maxLength: 200 },
  manufacturer: { type: 'string', maxLength: 100 },
  model: { type: 'string', maxLength: 100 },
  serialNumber: { type: 'string', maxLength: 60 },
  year: { type: 'number', minValue: 1900, maxValue: 2100 },
  location: { type: 'string', maxLength: 200 },
};

export const INVENTORY_SCHEMA: SchemaDefinition = {
  name: { required: true, type: 'string', maxLength: 200 },
  code: { required: true, type: 'string', maxLength: 30 },
  category: { type: 'string', enum: ['bearings', 'belts', 'seals', 'oils', 'filters', 'electrical', 'other'] },
  quantity: { required: true, type: 'number', minValue: 0 },
  unit: { required: true, type: 'string', maxLength: 10 },
  minQuantity: { type: 'number', minValue: 0 },
  location: { type: 'string', maxLength: 100 },
  buildingId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'L'] },
};

export const TASK_SCHEMA: SchemaDefinition = {
  title: { required: true, type: 'string', maxLength: 300 },
  description: { type: 'string' },
  priority: { required: true, type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] },
  status: { type: 'string', enum: ['backlog', 'planned', 'in_progress', 'paused', 'completed', 'cancelled'] },
  assignedToName: { type: 'string' },
  buildingId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'L'] },
};

// ═══════════════════════════════════════════
// VALIDATE
// ═══════════════════════════════════════════

export function validateExcelData(
  rows: Record<string, unknown>[],
  schema: SchemaDefinition
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let validRowCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel row (header = 1, first data = 2)
    let rowValid = true;

    for (const [field, rule] of Object.entries(schema)) {
      const value = row[field];

      // Required check
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ row: rowNum, field, message: `Povinné pole "${field}" je prázdné`, value });
        rowValid = false;
        continue;
      }

      // Skip optional empty
      if (value === undefined || value === null || value === '') continue;

      // Type check
      if (rule.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
        errors.push({ row: rowNum, field, message: `"${field}" musí být číslo`, value });
        rowValid = false;
      }

      if (rule.type === 'string' && typeof value !== 'string') {
        warnings.push({ row: rowNum, field, message: `"${field}" bude převedeno na text`, value });
      }

      // Max length
      if (rule.maxLength && String(value).length > rule.maxLength) {
        warnings.push({ row: rowNum, field, message: `"${field}" překračuje max délku (${rule.maxLength})`, value });
      }

      // Min/Max value
      if (rule.minValue !== undefined && Number(value) < rule.minValue) {
        errors.push({ row: rowNum, field, message: `"${field}" pod minimem (${rule.minValue})`, value });
        rowValid = false;
      }
      if (rule.maxValue !== undefined && Number(value) > rule.maxValue) {
        errors.push({ row: rowNum, field, message: `"${field}" nad maximem (${rule.maxValue})`, value });
        rowValid = false;
      }

      // Enum check
      if (rule.enum && !rule.enum.includes(String(value))) {
        errors.push({
          row: rowNum,
          field,
          message: `"${field}" má neplatnou hodnotu. Povolené: ${rule.enum.join(', ')}`,
          value,
        });
        rowValid = false;
      }

      // Pattern check
      if (rule.pattern && !rule.pattern.test(String(value))) {
        errors.push({ row: rowNum, field, message: `"${field}" neodpovídá požadovanému formátu`, value });
        rowValid = false;
      }
    }

    if (rowValid) validRowCount++;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: rows.length,
    validRowCount,
  };
}

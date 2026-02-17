// src/utils/importers/index.ts
// NOMINAL CMMS — Data importers & validators
// Skeleton pro budoucí hromadný import dat z Excelu / CSV

export { validateExcelData, type ValidationResult, type ValidationError } from './validateExcelData';
export { importAssets } from './importAssets';
export { importInventory } from './importInventory';
export { parseExcelFile, type ParseResult, type ColumnMapping } from './excelImporter';

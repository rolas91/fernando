export type CatalogScope =
  | 'certifications'
  | 'clients'
  | 'commercial-catalog-items'
  | 'equipment'
  | 'materials'
  | 'project-types'
  | 'projects'
  | 'skills'
  | 'status-catalog'
  | 'work-order-types'
  | 'worker-roles'
  | 'workers';

export const CATALOG_SCOPES: readonly CatalogScope[] = [
  'certifications',
  'clients',
  'commercial-catalog-items',
  'equipment',
  'materials',
  'project-types',
  'projects',
  'skills',
  'status-catalog',
  'work-order-types',
  'worker-roles',
  'workers',
] as const;

export type ImportMode = 'create' | 'upsert';

export type RowError = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

export type ParsedRow = {
  row: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown> | null;
  errors: RowError[];
  action?: 'create' | 'update' | 'skip';
  match?: { id?: string; field?: string };
};

export type PreviewResult = {
  scope: CatalogScope;
  headers: string[];
  total: number;
  valid: number;
  invalid: number;
  rows: ParsedRow[];
  sample: ParsedRow[];
};

export type ApplyResult = {
  scope: CatalogScope;
  mode: ImportMode;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: RowError[];
  durationMs: number;
  jobId?: string;
};

export type CatalogColumn = {
  key: string;
  header: string;
  required: boolean;
  example?: string;
  aliases?: string[];
  notes?: string;
  type?: 'string' | 'number' | 'date' | 'boolean' | 'csv' | 'enum';
  enumValues?: readonly string[];
};

export type CatalogDescriptor = {
  scope: CatalogScope;
  label: string;
  sheetName: string;
  columns: CatalogColumn[];
  exampleRow: Record<string, string | number | boolean | null>;
  supportsAsync?: boolean;
};

export type ImportJobStatus = 'queued' | 'running' | 'done' | 'error';

export type ImportJob = {
  id: string;
  scope: CatalogScope;
  mode: ImportMode;
  filename: string;
  status: ImportJobStatus;
  startedAt: string;
  finishedAt?: string;
  progress: { processed: number; total: number };
  result?: ApplyResult;
  error?: string;
};

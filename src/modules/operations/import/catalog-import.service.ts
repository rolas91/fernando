import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { In, type ObjectLiteral, type Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Client } from '../../../entities/client.entity';
import { CommercialCatalogItem } from '../../../entities/commercial-catalog-item.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { Project } from '../../../entities/project.entity';
import { ProjectType } from '../../../entities/project-type.entity';
import { Skill } from '../../../entities/skill.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkOrderType } from '../../../entities/work-order-type.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkerCertification } from '../../../entities/worker-certification.entity';
import { WorkerRole } from '../../../entities/worker-role.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  parseCertificationRow,
  parseCommercialCatalogItemRow,
  parseEquipmentRow,
  parseMaterialRow,
  parseProjectRow,
  parseProjectTypeRow,
  parseSkillRow,
  parseStatusCatalogRow,
  parseWorkOrderTypeRow,
  parseWorkerRoleRow,
} from './parsers/simple-catalogs.parser';
import { parseClientRow } from './parsers/clients.parser';
import { parseWorkerRow } from './parsers/workers.parser';
import { getDescriptor } from './parsers/descriptors';
import type {
  ApplyResult,
  CatalogScope,
  ImportJob,
  ImportMode,
  ParsedRow,
  PreviewResult,
} from './parsers/parser.types';
import { randomUUID } from 'crypto';

type RowParser = (raw: Record<string, unknown>, row: number) => ParsedRow;

const PARSERS: Record<CatalogScope, RowParser> = {
  skills: parseSkillRow,
  'worker-roles': parseWorkerRoleRow,
  'project-types': parseProjectTypeRow,
  'work-order-types': parseWorkOrderTypeRow,
  certifications: parseCertificationRow,
  equipment: parseEquipmentRow,
  materials: parseMaterialRow,
  'status-catalog': parseStatusCatalogRow,
  'commercial-catalog-items': parseCommercialCatalogItemRow,
  clients: parseClientRow,
  projects: parseProjectRow,
  workers: parseWorkerRow,
};

const SAMPLE_SIZE = 5;

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);
  private readonly jobs = new Map<string, ImportJob>();

  constructor(
    @InjectRepository(Skill) private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(WorkerRole) private readonly workerRolesRepo: Repository<WorkerRole>,
    @InjectRepository(ProjectType) private readonly projectTypesRepo: Repository<ProjectType>,
    @InjectRepository(WorkOrderType) private readonly workOrderTypesRepo: Repository<WorkOrderType>,
    @InjectRepository(Certification) private readonly certificationsRepo: Repository<Certification>,
    @InjectRepository(Equipment) private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Material) private readonly materialsRepo: Repository<Material>,
    @InjectRepository(StatusCatalog) private readonly statusCatalogRepo: Repository<StatusCatalog>,
    @InjectRepository(CommercialCatalogItem) private readonly commercialRepo: Repository<CommercialCatalogItem>,
    @InjectRepository(Client) private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Project) private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Worker) private readonly workersRepo: Repository<Worker>,
    @InjectRepository(WorkerCertification) private readonly workerCertificationsRepo: Repository<WorkerCertification>,
    private readonly realtime: RealtimeGateway,
  ) {}

  getJob(id: string): ImportJob | undefined {
    return this.jobs.get(id);
  }

  async preview(scope: CatalogScope, buffer: Buffer, filename?: string): Promise<PreviewResult> {
    const rawRows = await this.parseWorkbook(buffer, scope);
    const parser = PARSERS[scope];
    const parsed: ParsedRow[] = rawRows.map((raw, idx) => parser(raw, idx + 2));
    const result: PreviewResult = {
      scope,
      headers: this.collectHeaders(rawRows),
      total: parsed.length,
      valid: parsed.filter((p) => p.errors.length === 0).length,
      invalid: parsed.filter((p) => p.errors.length > 0).length,
      rows: parsed,
      sample: parsed.slice(0, SAMPLE_SIZE),
    };
    void filename;
    return result;
  }

  async apply(
    scope: CatalogScope,
    buffer: Buffer,
    options: { mode: ImportMode; dryRun?: boolean; filename?: string; onProgress?: (p: { processed: number; total: number }) => void } = { mode: 'upsert' },
  ): Promise<ApplyResult> {
    const started = Date.now();
    const preview = await this.preview(scope, buffer);
    const errors = preview.rows.flatMap((r) => r.errors);
    const result: ApplyResult = {
      scope,
      mode: options.mode,
      total: preview.total,
      created: 0,
      updated: 0,
      skipped: 0,
      errors,
      durationMs: 0,
    };
    if (options.dryRun) {
      result.durationMs = Date.now() - started;
      return result;
    }
    for (let i = 0; i < preview.rows.length; i++) {
      const row = preview.rows[i];
      if (row.errors.length > 0) {
        result.skipped++;
        continue;
      }
      try {
        const action = await this.upsertRow(scope, row, options.mode);
        if (action === 'create') result.created++;
        else if (action === 'update') result.updated++;
        else result.skipped++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ row: row.row, code: 'UPSERT_FAILED', message: msg });
        result.skipped++;
        this.logger.warn(`Import row ${row.row} (${scope}) failed: ${msg}`);
      }
      if (options.onProgress && (i % 25 === 0 || i === preview.rows.length - 1)) {
        options.onProgress({ processed: i + 1, total: preview.rows.length });
      }
    }
    result.durationMs = Date.now() - started;
    return result;
  }

  async applyAsync(
    scope: CatalogScope,
    buffer: Buffer,
    options: { mode: ImportMode; filename?: string },
  ): Promise<ImportJob> {
    const job: ImportJob = {
      id: randomUUID(),
      scope,
      mode: options.mode,
      filename: options.filename || `${scope}.xlsx`,
      status: 'queued',
      startedAt: new Date().toISOString(),
      progress: { processed: 0, total: 0 },
    };
    this.jobs.set(job.id, job);
    setImmediate(() => {
      void this.runJob(job, buffer);
    });
    return job;
  }

  private async runJob(job: ImportJob, buffer: Buffer): Promise<void> {
    job.status = 'running';
    try {
      const preview = await this.preview(job.scope, buffer);
      job.progress.total = preview.total;
      const result = await this.apply(job.scope, buffer, {
        mode: job.mode,
        onProgress: (p) => {
          job.progress = p;
        },
      });
      job.result = result;
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date().toISOString();
      this.logger.error(`Async import job ${job.id} (${job.scope}) failed`, err as Error);
    }
  }

  async generateTemplate(scope: CatalogScope): Promise<Buffer> {
    const descriptor = getDescriptor(scope);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DR Backend';
    wb.created = new Date();
    const ws = wb.addWorksheet(descriptor.sheetName);
    ws.columns = descriptor.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.max(14, col.header.length + 4),
    }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' },
    };
    ws.addRow(descriptor.exampleRow);
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private collectHeaders(rows: Array<Record<string, unknown>>): string[] {
    const set = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) set.add(k);
    return Array.from(set);
  }

  private async parseWorkbook(buffer: Buffer, scope: CatalogScope): Promise<Array<Record<string, unknown>>> {
    const wb = new ExcelJS.Workbook();
    const nodeBuffer = (Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as Uint8Array));
    await wb.xlsx.load(nodeBuffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const descriptor = getDescriptor(scope);
    const ws = wb.getWorksheet(descriptor.sheetName) || wb.worksheets[0];
    if (!ws) return [];
    const rows: Array<Record<string, unknown>> = [];
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? '').trim();
    });
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      let hasData = false;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (!header) return;
        const value = this.cellValue(cell);
        if (value !== null && value !== '') hasData = true;
        obj[header] = value;
      });
      if (hasData) rows.push(obj);
    });
    return rows;
  }

  private cellValue(cell: ExcelJS.Cell): unknown {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      const obj = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }>; formula?: unknown };
      if (obj.result !== undefined) return obj.result;
      if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('');
      if (obj.text !== undefined) return obj.text;
      if (obj.formula !== undefined) return obj.formula;
    }
    return String(v);
  }

  private async upsertRow(
    scope: CatalogScope,
    parsed: ParsedRow,
    mode: ImportMode,
  ): Promise<'create' | 'update' | 'skip'> {
    if (!parsed.data) return 'skip';
    const data = parsed.data;
    const match = await this.findMatch(scope, data);
    if (match && mode === 'create') {
      parsed.action = 'skip';
      parsed.match = { id: match.id, field: 'id' };
      return 'skip';
    }
    if (match) {
      await this.updateEntity(scope, match.id, data);
      parsed.action = 'update';
      parsed.match = { id: match.id, field: 'id' };
      return 'update';
    }
    await this.createEntity(scope, data);
    parsed.action = 'create';
    return 'create';
  }

  private async findMatch(
    scope: CatalogScope,
    data: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const id = typeof data.id === 'string' ? data.id : undefined;
    if (id) {
      const repo = this.repoFor(scope);
      if (repo) {
        const found = await repo.findOne({ where: { id } });
        if (found) return { id };
      }
    }
    const nameKey = this.nameKeyFor(scope);
    if (nameKey && typeof data[nameKey] === 'string') {
      const repo = this.repoFor(scope);
      if (repo) {
        const list = await repo.find();
        const target = String(data[nameKey]).trim().toLowerCase();
        const found = list.find((item: Record<string, unknown>) => {
          const n = item[nameKey];
          return typeof n === 'string' && n.trim().toLowerCase() === target;
        });
        if (found) return { id: String((found as { id: string }).id) };
      }
    }
    if (scope === 'status-catalog') {
      const list = await this.statusCatalogRepo.find();
      const scopeVal = String(data.scope || '').toLowerCase();
      const valueVal = String(data.value || '').toLowerCase();
      const found = list.find(
        (s) => s.scope.toLowerCase() === scopeVal && s.value.toLowerCase() === valueVal,
      );
      if (found) return { id: found.id };
    }
    if (scope === 'commercial-catalog-items') {
      const sku = String(data.sku || '').trim();
      if (sku) {
        const found = await this.commercialRepo.findOne({ where: { sku } });
        if (found) return { id: found.id };
      }
    }
    if (scope === 'workers') {
      const email = String(data.email || '').trim().toLowerCase();
      if (email) {
        const list = await this.workersRepo.find();
        const found = list.find((w) => w.email.trim().toLowerCase() === email);
        if (found) return { id: found.id };
      }
    }
    if (scope === 'projects') {
      const number = String(data.number || '').trim();
      if (number) {
        const list = await this.projectsRepo.find();
        const found = list.find((p) => p.number.trim().toLowerCase() === number.toLowerCase());
        if (found) return { id: found.id };
      }
    }
    return null;
  }

  private nameKeyFor(scope: CatalogScope): string | null {
    if (
      scope === 'skills' ||
      scope === 'worker-roles' ||
      scope === 'project-types' ||
      scope === 'work-order-types' ||
      scope === 'certifications' ||
      scope === 'equipment' ||
      scope === 'materials' ||
      scope === 'clients'
    ) {
      return 'name';
    }
    return null;
  }

  private repoFor(scope: CatalogScope): Repository<ObjectLiteral> | null {
    switch (scope) {
      case 'skills':
        return this.skillsRepo as unknown as Repository<ObjectLiteral>;
      case 'worker-roles':
        return this.workerRolesRepo as unknown as Repository<ObjectLiteral>;
      case 'project-types':
        return this.projectTypesRepo as unknown as Repository<ObjectLiteral>;
      case 'work-order-types':
        return this.workOrderTypesRepo as unknown as Repository<ObjectLiteral>;
      case 'certifications':
        return this.certificationsRepo as unknown as Repository<ObjectLiteral>;
      case 'equipment':
        return this.equipmentRepo as unknown as Repository<ObjectLiteral>;
      case 'materials':
        return this.materialsRepo as unknown as Repository<ObjectLiteral>;
      case 'status-catalog':
        return this.statusCatalogRepo as unknown as Repository<ObjectLiteral>;
      case 'commercial-catalog-items':
        return this.commercialRepo as unknown as Repository<ObjectLiteral>;
      case 'clients':
        return this.clientsRepo as unknown as Repository<ObjectLiteral>;
      case 'projects':
        return this.projectsRepo as unknown as Repository<ObjectLiteral>;
      case 'workers':
        return this.workersRepo as unknown as Repository<ObjectLiteral>;
      default:
        return null;
    }
  }

  private async createEntity(scope: CatalogScope, data: Record<string, unknown>): Promise<void> {
    switch (scope) {
      case 'skills': {
        const entity = this.skillsRepo.create({
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string) || '',
          status: data.status as string,
        });
        await this.skillsRepo.save(entity);
        this.emitUpdated('skills', 'workers');
        return;
      }
      case 'worker-roles': {
        const entity = this.workerRolesRepo.create({
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string) || '',
          status: data.status as string,
        });
        await this.workerRolesRepo.save(entity);
        this.emitUpdated('worker_roles', 'workers');
        return;
      }
      case 'project-types': {
        const entity = this.projectTypesRepo.create({
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string) || '',
          status: data.status as string,
        });
        await this.projectTypesRepo.save(entity);
        this.emitUpdated('project_types');
        return;
      }
      case 'work-order-types': {
        const entity = this.workOrderTypesRepo.create({
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string) || '',
          status: data.status as string,
        });
        await this.workOrderTypesRepo.save(entity);
        this.emitUpdated('work_order_types');
        return;
      }
      case 'certifications': {
        const entity = this.certificationsRepo.create({
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string) || '',
          status: data.status as string,
          documentUrl: (data.documentUrl as string) || '',
        });
        await this.certificationsRepo.save(entity);
        this.emitUpdated('certifications', 'workers');
        return;
      }
      case 'equipment': {
        const entity = this.equipmentRepo.create(data as unknown as Equipment);
        await this.equipmentRepo.save(entity);
        this.emitUpdated('equipment');
        return;
      }
      case 'materials': {
        const entity = this.materialsRepo.create(data as unknown as Material);
        await this.materialsRepo.save(entity);
        this.emitUpdated('materials');
        return;
      }
      case 'status-catalog': {
        const entity = this.statusCatalogRepo.create(data as unknown as StatusCatalog);
        await this.statusCatalogRepo.save(entity);
        this.emitUpdated('status_catalog');
        return;
      }
      case 'commercial-catalog-items': {
        const sku = String((data as { sku?: string }).sku || '').trim();
        if (!sku) throw new Error('SKU es requerido');
        const exists = await this.commercialRepo.findOne({ where: { sku } });
        if (exists) throw new Error(`SKU ${sku} ya existe`);
        const entity = this.commercialRepo.create(data as unknown as CommercialCatalogItem);
        if (!entity.id) entity.id = `cci_${randomUUID()}`;
        await this.commercialRepo.save(entity);
        this.emitUpdated('commercial_catalog_items');
        return;
      }
      case 'clients': {
        const entity = this.clientsRepo.create(data as unknown as Client);
        entity.address = (entity.address ?? '').trim();
        entity.city = (entity.city ?? '').trim();
        entity.state = (entity.state ?? '').trim();
        entity.zipCode = (entity.zipCode ?? '').trim();
        entity.country = (entity.country ?? '').trim() || 'USA';
        await this.clientsRepo.save(entity);
        this.emitUpdated('clients');
        return;
      }
      case 'projects': {
        const payload: Record<string, unknown> = { ...(data as Record<string, unknown>) };
        const clientName = String(payload.clientName || '').trim();
        if (!payload.clientId && clientName) {
          const clients = await this.clientsRepo.find();
          const found = clients.find((c) => c.name.trim().toLowerCase() === clientName.toLowerCase());
          if (found) payload.clientId = found.id;
        }
        const projectTypeName = String(payload.projectTypeName || '').trim();
        if (!payload.projectTypeId && projectTypeName) {
          const types = await this.projectTypesRepo.find();
          const foundType = types.find((t) => t.name.trim().toLowerCase() === projectTypeName.toLowerCase());
          if (foundType) payload.projectTypeId = foundType.id;
        }
        delete payload.clientName;
        delete payload.projectTypeName;
        const entity = this.projectsRepo.create(payload as unknown as Project);
        entity.country = (entity.country ?? '').trim() || 'USA';
        await this.projectsRepo.save(entity);
        this.emitUpdated('projects');
        return;
      }
      case 'workers': {
        const payload: Record<string, unknown> = { ...(data as Record<string, unknown>) };
        const skills = (payload.skills as string[] | undefined) || [];
        const workerRoles = (payload.workerRoles as string[] | undefined) || [];
        const certs = (payload.certifications as string[] | undefined) || [];
        delete payload.skills;
        delete payload.workerRoles;
        delete payload.certifications;
        if (payload.hourlyRate !== undefined) {
          payload.hourlyRate = String(payload.hourlyRate);
        }
        const skillIds = await this.resolveNames(this.skillsRepo, skills);
        const roleIds = await this.resolveNames(this.workerRolesRepo, workerRoles);
        const certIds = await this.resolveNames(this.certificationsRepo, certs);
        const skillsEntities = skillIds.length
          ? await this.skillsRepo.findBy({ id: In(skillIds) })
          : [];
        const rolesEntities = roleIds.length
          ? await this.workerRolesRepo.findBy({ id: In(roleIds) })
          : [];
        const entity = this.workersRepo.create({
          ...(payload as unknown as Worker),
          skills: skillsEntities,
          workerRoles: rolesEntities,
        });
        entity.country = (entity.country ?? '').trim() || 'USA';
        const saved = await this.workersRepo.save(entity);
        if (certIds.length > 0) {
          await this.replaceWorkerCertifications(saved.id, certIds);
        }
        this.emitUpdated('workers');
        return;
      }
      default:
        throw new Error(`Unknown scope ${scope}`);
    }
  }

  private async updateEntity(scope: CatalogScope, id: string, data: Record<string, unknown>): Promise<void> {
    switch (scope) {
      case 'skills': {
        const item = await this.skillsRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Skill ${id} not found`);
        if (data.name !== undefined) item.name = data.name as string;
        if (data.description !== undefined) item.description = data.description as string;
        if (data.status !== undefined) item.status = data.status as string;
        await this.skillsRepo.save(item);
        this.emitUpdated('skills', 'workers');
        return;
      }
      case 'worker-roles': {
        const item = await this.workerRolesRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Worker role ${id} not found`);
        if (data.name !== undefined) item.name = data.name as string;
        if (data.description !== undefined) item.description = data.description as string;
        if (data.status !== undefined) item.status = data.status as string;
        await this.workerRolesRepo.save(item);
        this.emitUpdated('worker_roles', 'workers');
        return;
      }
      case 'project-types': {
        const item = await this.projectTypesRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Project type ${id} not found`);
        if (data.name !== undefined) item.name = data.name as string;
        if (data.description !== undefined) item.description = data.description as string;
        if (data.status !== undefined) item.status = data.status as string;
        await this.projectTypesRepo.save(item);
        this.emitUpdated('project_types');
        return;
      }
      case 'work-order-types': {
        const item = await this.workOrderTypesRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Work order type ${id} not found`);
        if (data.name !== undefined) item.name = data.name as string;
        if (data.description !== undefined) item.description = data.description as string;
        if (data.status !== undefined) item.status = data.status as string;
        await this.workOrderTypesRepo.save(item);
        this.emitUpdated('work_order_types');
        return;
      }
      case 'certifications': {
        const item = await this.certificationsRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Certification ${id} not found`);
        if (data.name !== undefined) item.name = data.name as string;
        if (data.description !== undefined) item.description = data.description as string;
        if (data.status !== undefined) item.status = data.status as string;
        if (data.documentUrl !== undefined) item.documentUrl = data.documentUrl as string;
        await this.certificationsRepo.save(item);
        this.emitUpdated('certifications', 'workers');
        return;
      }
      case 'equipment': {
        const item = await this.equipmentRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Equipment ${id} not found`);
        Object.assign(item, data);
        await this.equipmentRepo.save(item);
        this.emitUpdated('equipment');
        return;
      }
      case 'materials': {
        const item = await this.materialsRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Material ${id} not found`);
        Object.assign(item, data);
        await this.materialsRepo.save(item);
        this.emitUpdated('materials');
        return;
      }
      case 'status-catalog': {
        const item = await this.statusCatalogRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Status ${id} not found`);
        Object.assign(item, data);
        await this.statusCatalogRepo.save(item);
        this.emitUpdated('status_catalog');
        return;
      }
      case 'commercial-catalog-items': {
        const item = await this.commercialRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Catalog item ${id} not found`);
        Object.assign(item, data);
        await this.commercialRepo.save(item);
        this.emitUpdated('commercial_catalog_items');
        return;
      }
      case 'clients': {
        const item = await this.clientsRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Client ${id} not found`);
        Object.assign(item, data);
        item.address = (item.address ?? '').trim();
        item.city = (item.city ?? '').trim();
        item.state = (item.state ?? '').trim();
        item.zipCode = (item.zipCode ?? '').trim();
        item.country = (item.country ?? '').trim() || 'USA';
        await this.clientsRepo.save(item);
        this.emitUpdated('clients');
        return;
      }
      case 'projects': {
        const item = await this.projectsRepo.findOne({ where: { id } });
        if (!item) throw new Error(`Project ${id} not found`);
        const payload: Record<string, unknown> = { ...(data as Record<string, unknown>) };
        const clientName = String(payload.clientName || '').trim();
        if (!payload.clientId && clientName) {
          const clients = await this.clientsRepo.find();
          const found = clients.find((c) => c.name.trim().toLowerCase() === clientName.toLowerCase());
          if (found) payload.clientId = found.id;
        }
        const projectTypeName = String(payload.projectTypeName || '').trim();
        if (!payload.projectTypeId && projectTypeName) {
          const types = await this.projectTypesRepo.find();
          const foundType = types.find((t) => t.name.trim().toLowerCase() === projectTypeName.toLowerCase());
          if (foundType) payload.projectTypeId = foundType.id;
        }
        delete payload.clientName;
        delete payload.projectTypeName;
        delete payload.id;
        Object.assign(item, payload);
        item.country = (item.country ?? '').trim() || 'USA';
        await this.projectsRepo.save(item);
        this.emitUpdated('projects');
        return;
      }
      case 'workers': {
        const item = await this.workersRepo.findOne({
          where: { id },
          relations: { skills: true, workerRoles: true },
        });
        if (!item) throw new Error(`Worker ${id} not found`);
        const payload: Record<string, unknown> = { ...(data as Record<string, unknown>) };
        const skills = (payload.skills as string[] | undefined) || [];
        const workerRoles = (payload.workerRoles as string[] | undefined) || [];
        const certs = (payload.certifications as string[] | undefined) || [];
        delete payload.skills;
        delete payload.workerRoles;
        delete payload.certifications;
        delete payload.id;
        if (payload.hourlyRate !== undefined) {
          item.hourlyRate = String(payload.hourlyRate);
        }
        delete payload.hourlyRate;
        Object.assign(item, payload);
        item.country = (item.country ?? '').trim() || 'USA';
        if (skills.length) {
          const skillIds = await this.resolveNames(this.skillsRepo, skills);
          item.skills = skillIds.length
            ? await this.skillsRepo.findBy({ id: In(skillIds) })
            : [];
        }
        if (workerRoles.length) {
          const roleIds = await this.resolveNames(this.workerRolesRepo, workerRoles);
          item.workerRoles = roleIds.length
            ? await this.workerRolesRepo.findBy({ id: In(roleIds) })
            : [];
        }
        await this.workersRepo.save(item);
        if (certs.length) {
          const certIds = await this.resolveNames(this.certificationsRepo, certs);
          await this.replaceWorkerCertifications(id, certIds);
        }
        this.emitUpdated('workers');
        return;
      }
      default:
        throw new Error(`Unknown scope ${scope}`);
    }
  }

  private emitUpdated(...tables: string[]): void {
    for (const t of tables) this.realtime.emitTableUpdated(t);
  }

  private async replaceWorkerCertifications(
    workerId: string,
    certIds: string[],
  ): Promise<void> {
    await this.workerCertificationsRepo.delete({ workerId });
    if (certIds.length === 0) return;
    const known = await this.certificationsRepo.findBy(
      certIds.map((cid) => ({ id: cid })),
    );
    const knownIds = new Set(known.map((c) => c.id));
    const records = certIds
      .filter((cid) => knownIds.has(cid))
      .map((cid) =>
        this.workerCertificationsRepo.create({
          workerId,
          certificationId: cid,
          expirationDate: null,
        }),
      );
    if (records.length > 0) await this.workerCertificationsRepo.save(records);
  }

  private async resolveNames<T extends { id: string }>(
    repo: Repository<T>,
    names: string[],
  ): Promise<string[]> {
    if (!names || names.length === 0) return [];
    const all = await repo.find();
    const lowerMap = new Map<string, string>();
    for (const item of all) {
      const n = (item as unknown as { name?: string }).name;
      if (n) lowerMap.set(n.trim().toLowerCase(), item.id);
    }
    const out: string[] = [];
    for (const name of names) {
      const id = lowerMap.get(name.trim().toLowerCase());
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }
}

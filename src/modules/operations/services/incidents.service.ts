import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Incident } from '../../../entities/incident.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateIncidentDto } from '../dto/create-incident.dto';
import { UpdateIncidentDto } from '../dto/update-incident.dto';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly repo: Repository<Incident>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionsRepo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly formTemplatesRepo: Repository<FormTemplate>,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findAll() {
    await this.reconcileIncidentSubmissions();
    return this.repo.find({ order: { date: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Incident ${id} not found`);
    return item;
  }

  create(dto: CreateIncidentDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('incidents');
      return saved;
    });
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('incidents');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('incidents');
    return { success: true };
  }

  private isIncidentTemplate(template: FormTemplate) {
    return [template.category, template.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes('incident'));
  }

  private dataString(data: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return '';
  }

  private dataDate(data: Record<string, unknown>, keys: string[], fallback?: Date | null) {
    const raw = this.dataString(data, keys);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (fallback instanceof Date && !Number.isNaN(fallback.getTime())) {
      return fallback.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeSeverity(value: string) {
    const key = value.trim().toLowerCase();
    return ['low', 'medium', 'high', 'critical'].includes(key) ? key : 'medium';
  }

  private async reconcileIncidentSubmissions() {
    const templates = await this.formTemplatesRepo.find();
    const incidentTemplateIds = templates.filter((template) => this.isIncidentTemplate(template)).map((template) => template.id);
    if (incidentTemplateIds.length === 0) return;

    const submissions = await this.formSubmissionsRepo.find({
      where: { templateId: In(incidentTemplateIds), status: 'submitted' },
      order: { submittedAt: 'DESC' },
    });
    if (submissions.length === 0) return;

    const existingIds = new Set((await this.repo.find({
      where: { id: In(submissions.map((submission) => `inc_${submission.id}`.slice(0, 64))) },
    })).map((incident) => incident.id));

    const toSave: Incident[] = [];
    for (const submission of submissions) {
      const id = `inc_${submission.id}`.slice(0, 64);
      if (existingIds.has(id)) continue;
      const data = submission.data ?? {};
      const template = templates.find((item) => item.id === submission.templateId);
      const incidentType = this.dataString(data, ['incident_type', 'incidentType', 'type']);
      const title =
        this.dataString(data, ['title', 'incident_title', 'incidentTitle']) ||
        (incidentType ? `${incidentType} Incident` : template?.name || 'Incident Report');
      toSave.push(this.repo.create({
        id,
        projectId: submission.projectId || '',
        reportedBy: submission.workerId || this.dataString(data, ['reported_by', 'reportedBy', 'person_reporting', 'personReporting']),
        date: this.dataDate(data, ['incident_date', 'incidentDate', 'report_date', 'reportDate'], submission.submittedAt),
        severity: this.normalizeSeverity(this.dataString(data, ['severity', 'severity_level', 'severityLevel'])),
        status: this.dataString(data, ['incident_status', 'incidentStatus', 'status']).trim().toLowerCase() || 'open',
        title: title.slice(0, 255),
        description: this.dataString(data, ['what_happened', 'whatHappened', 'description', 'incident_description', 'incidentDescription', 'narrative']),
        location: this.dataString(data, ['incident_location', 'incidentLocation', 'location']),
        actions: this.dataString(data, ['immediate_actions_taken', 'immediateActionsTaken', 'actions', 'actions_taken', 'actionsTaken']),
        photos: Array.isArray(data.photos_evidence) ? data.photos_evidence.map((item) => String(item)).filter(Boolean) : [],
      }));
    }

    if (toSave.length > 0) {
      await this.repo.save(toSave);
      this.realtime.emitTableUpdated('incidents');
    }
  }
}

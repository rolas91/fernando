import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Timesheet } from '../../../entities/timesheet.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateTimesheetDto } from '../dto/create-timesheet.dto';
import { UpdateTimesheetDto } from '../dto/update-timesheet.dto';

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetsRepo: Repository<Timesheet>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.timesheetsRepo.find({ order: { date: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.timesheetsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Timesheet ${id} not found`);
    return item;
  }

  create(dto: CreateTimesheetDto) {
    return this.timesheetsRepo
      .save(
        this.timesheetsRepo.create({
          ...dto,
          regularHours:
            dto.regularHours !== undefined
              ? String(dto.regularHours)
              : undefined,
          overtimeHours:
            dto.overtimeHours !== undefined
              ? String(dto.overtimeHours)
              : undefined,
          doubleTimeHours:
            dto.doubleTimeHours !== undefined
              ? String(dto.doubleTimeHours)
              : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('timesheets');
        return saved;
      });
  }

  async update(id: string, dto: UpdateTimesheetDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      regularHours:
        dto.regularHours !== undefined ? String(dto.regularHours) : undefined,
      overtimeHours:
        dto.overtimeHours !== undefined ? String(dto.overtimeHours) : undefined,
      doubleTimeHours:
        dto.doubleTimeHours !== undefined
          ? String(dto.doubleTimeHours)
          : undefined,
    });
    const saved = await this.timesheetsRepo.save(item);
    this.realtime.emitTableUpdated('timesheets');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.timesheetsRepo.remove(item);
    this.realtime.emitTableUpdated('timesheets');
    return { success: true };
  }
}

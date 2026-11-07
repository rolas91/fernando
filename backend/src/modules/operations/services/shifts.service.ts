import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from '../../../entities/shift.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateShiftDto } from '../dto/create-shift.dto';
import { UpdateShiftDto } from '../dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftsRepo: Repository<Shift>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.shiftsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const shift = await this.shiftsRepo.findOne({ where: { id } });
    if (!shift) throw new NotFoundException(`Shift ${id} not found`);
    return shift;
  }

  create(dto: CreateShiftDto) {
    return this.shiftsRepo.save(this.shiftsRepo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('shifts');
      return saved;
    });
  }

  async update(id: string, dto: UpdateShiftDto) {
    const shift = await this.findOne(id);
    Object.assign(shift, dto);
    const saved = await this.shiftsRepo.save(shift);
    this.realtime.emitTableUpdated('shifts');
    return saved;
  }

  async remove(id: string) {
    const shift = await this.findOne(id);
    await this.shiftsRepo.remove(shift);
    this.realtime.emitTableUpdated('shifts');
    return { success: true };
  }
}

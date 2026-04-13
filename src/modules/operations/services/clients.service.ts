import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../../entities/client.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateClientDto } from '../dto/create-client.dto';
import { UpdateClientDto } from '../dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.clientsRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.clientsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Client ${id} not found`);
    return item;
  }

  create(dto: CreateClientDto) {
    return this.clientsRepo.save(this.clientsRepo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('clients');
      return saved;
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.clientsRepo.save(item);
    this.realtime.emitTableUpdated('clients');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.clientsRepo.remove(item);
    this.realtime.emitTableUpdated('clients');
    return { success: true };
  }
}

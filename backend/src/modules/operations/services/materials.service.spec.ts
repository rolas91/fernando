import { BadRequestException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { MaterialsService } from './materials.service';
import { BulkDeleteMaterialsDto } from '../dto/bulk-delete-materials.dto';
import { CreateMaterialDto } from '../dto/create-material.dto';

describe('MaterialsService identity and bulk removal', () => {
  const setup = () => {
    const item = {
      id: 'original-id',
      identifier: 'LEGACY-1',
      sku: '',
      name: 'Cone',
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value),
      softDelete: jest.fn().mockResolvedValue({ affected: 2 }),
      find: jest.fn().mockResolvedValue([]),
    };
    const realtime = { emitTableUpdated: jest.fn() };
    const service = new MaterialsService(repo as never, realtime as never);
    return { item, repo, realtime, service };
  };

  it('edits SKU without changing the internal ID or legacy identifier', async () => {
    const { service, repo } = setup();
    const saved = await service.update('original-id', { sku: ' SKU-NEW ' });
    expect(saved).toMatchObject({
      id: 'original-id',
      identifier: 'LEGACY-1',
      sku: 'SKU-NEW',
    });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'original-id' } });
  });

  it('rejects changing an ID and reusing an existing or archived ID', async () => {
    const { service, repo } = setup();
    await expect(
      service.update('original-id', { id: 'different-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ id: 'original-id' } as CreateMaterialDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'original-id' },
      withDeleted: true,
    });
  });

  it('removes a batch in one soft-delete statement and notifies only after success', async () => {
    const { service, repo, realtime } = setup();
    expect(await service.removeMany(['one', 'two'])).toEqual({
      success: true,
      deletedCount: 2,
    });
    expect(repo.softDelete).toHaveBeenCalledTimes(1);
    expect(repo.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.objectContaining({ _value: ['one', 'two'] }),
        deletedAt: expect.anything(),
      }),
    );
    expect(realtime.emitTableUpdated).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not report success when removal fails', async () => {
    const { service, repo, realtime } = setup();
    repo.softDelete.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.removeMany(['one'])).rejects.toThrow(
      'database unavailable',
    );
    expect(realtime.emitTableUpdated).not.toHaveBeenCalled();
  });

  it('resolves archived records for historical reads but keeps the catalog active-only', async () => {
    const { service, repo } = setup();
    await service.findOne('original-id', true);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'original-id' },
      withDeleted: true,
    });
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { identifier: 'ASC' } });
  });

  it('rejects empty, oversized and invalid batches', async () => {
    const { service, repo } = setup();
    await expect(service.removeMany([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.removeMany(Array(1001).fill('one')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.softDelete).not.toHaveBeenCalled();
    for (const ids of [[], [''], ['one', 'one'], [123], ['x'.repeat(65)]]) {
      const dto = Object.assign(new BulkDeleteMaterialsDto(), { ids });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });
});

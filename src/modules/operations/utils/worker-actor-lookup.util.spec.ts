import type { Repository } from 'typeorm';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { findWorkerForActor } from './worker-actor-lookup.util';

function actor(id = 'user-1', email = ' Worker@Example.com '): UserAccessContext {
  return { id, email } as UserAccessContext;
}

function repository() {
  return {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<Worker>>;
}

describe('findWorkerForActor', () => {
  it('prefers the explicit user link over email matching', async () => {
    const repo = repository();
    const linkedWorker = { id: 'worker-1', userId: 'user-1' } as Worker;
    repo.findOne.mockResolvedValueOnce(linkedWorker);

    await expect(findWorkerForActor(repo, actor())).resolves.toBe(linkedWorker);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      relations: undefined,
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('falls back to normalized email and persists the durable link', async () => {
    const repo = repository();
    const legacyWorker = {
      id: 'worker-legacy',
      email: 'worker@example.com',
      userId: null,
    } as Worker;
    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(legacyWorker);

    await expect(findWorkerForActor(repo, actor())).resolves.toBe(legacyWorker);
    expect(repo.update).toHaveBeenCalledWith('worker-legacy', {
      userId: 'user-1',
    });
    expect(legacyWorker.userId).toBe('user-1');
  });

  it('does not expose a worker already linked to another user', async () => {
    const repo = repository();
    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'worker-2',
        email: 'worker@example.com',
        userId: 'user-2',
      } as Worker);

    await expect(findWorkerForActor(repo, actor())).resolves.toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

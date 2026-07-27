import type { FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { Raw } from 'typeorm';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';

export async function findWorkerForActor(
  workersRepo: Repository<Worker>,
  actor: UserAccessContext | undefined,
  relations?: FindOneOptions<Worker>['relations'],
): Promise<Worker | null> {
  const email = actor?.email?.trim().toLowerCase();
  if (actor?.id) {
    const linkedWorker = await workersRepo.findOne({
      where: { userId: actor.id },
      relations,
    });
    if (linkedWorker) return linkedWorker;
  }
  if (!email) return null;

  const emailWhere: FindOptionsWhere<Worker> = {
    email: Raw(
      (alias) => `LOWER(BTRIM(${alias})) = :normalizedWorkerEmail`,
      { normalizedWorkerEmail: email },
    ),
  };
  const worker = await workersRepo.findOne({
    where: emailWhere,
    relations,
  });
  if (!worker) return null;

  // Existing installations only had an email-based association. Persist the
  // durable link the first time that account resolves its worker profile.
  if (actor?.id && !worker.userId) {
    await workersRepo.update(worker.id, { userId: actor.id });
    worker.userId = actor.id;
  }
  if (actor?.id && worker.userId !== actor.id) return null;
  return worker;
}

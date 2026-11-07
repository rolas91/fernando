import type { Worker } from '@/lib/types';

export function getWorkerActiveSkillIdSet(worker: Worker): Set<string> {
  const activeFromSkills = (worker.skills ?? [])
    .filter((s) => s.status === 'active')
    .map((s) => s.id);
  if (activeFromSkills.length > 0) {
    return new Set(activeFromSkills);
  }
  return new Set(worker.skillIds ?? []);
}

export function workerMeetsRoleSkillRequirements(
  worker: Worker,
  requiredSkillIds: string[] | undefined,
): boolean {
  if (!requiredSkillIds?.length) return true;
  const have = getWorkerActiveSkillIdSet(worker);
  return requiredSkillIds.every((id) => have.has(id));
}

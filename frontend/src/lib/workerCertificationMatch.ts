import type { Worker } from '@/lib/types';

export function getRoleRequiredCertificationIds(role: {
  requiredCertificationIds?: string[];
  requiredSkillIds?: string[];
}): string[] {
  return role.requiredCertificationIds ?? role.requiredSkillIds ?? [];
}

export function getWorkerActiveCertificationIdSet(worker: Worker): Set<string> {
  const activeFromCertifications = (worker.certifications ?? [])
    .filter((certification) => certification.status !== 'inactive')
    .map((certification) => certification.id);
  if (activeFromCertifications.length > 0) {
    return new Set(activeFromCertifications);
  }
  return new Set(worker.certificationIds ?? []);
}

export function workerMeetsRoleCertificationRequirements(
  worker: Worker,
  requiredCertificationIds: string[] | undefined,
): boolean {
  if (!requiredCertificationIds?.length) return true;
  const have = getWorkerActiveCertificationIdSet(worker);
  return requiredCertificationIds.every((id) => have.has(id));
}

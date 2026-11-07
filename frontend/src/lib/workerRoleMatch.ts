import type { Worker, WorkerRole } from './types';

function roleLabel(role: WorkerRole | { name: string }): string {
  return (role.name || '').trim();
}

function isActiveRole(role: { status?: string }): boolean {
  return role.status !== 'inactive';
}

function workerRoleCandidates(worker: Worker): string[] {
  const fromRelation = (worker.workerRoles || [])
    .filter(isActiveRole)
    .map(roleLabel)
    .filter(Boolean);
  if (fromRelation.length > 0) return fromRelation;
  const fromLegacy = (worker.type || '').trim();
  return fromLegacy ? [fromLegacy] : [];
}

export function assignmentRoleOptions(
  workerRoles: WorkerRole[] = [],
): string[] {
  const names = workerRoles.filter(isActiveRole).map(roleLabel).filter(Boolean);
  return names.length > 0 ? Array.from(new Set(names)) : ['Flagger'];
}

export function workerHasAssignmentRole(
  worker: Worker,
  roleName: string,
): boolean {
  const target = roleName.trim().toLowerCase();
  if (!target) return true;
  return workerRoleCandidates(worker).some(
    (name) => name.toLowerCase() === target,
  );
}

export function workerRoleNames(worker: Worker): string[] {
  const names = workerRoleCandidates(worker);
  return Array.from(new Set(names));
}

type ShiftRoleName = { roleName: string };

export function availableRoleNamesForCard(
  catalog: readonly string[],
  roles: readonly ShiftRoleName[],
  currentIndex: number,
) {
  const currentRoleName = roles[currentIndex]?.roleName;
  const usedByOtherCards = new Set(
    roles
      .filter((_, index) => index !== currentIndex)
      .map((role) => role.roleName),
  );
  return catalog.filter(
    (roleName) =>
      roleName === currentRoleName || !usedByOtherCards.has(roleName),
  );
}

export function nextUnusedRoleName(
  catalog: readonly string[],
  roles: readonly ShiftRoleName[],
) {
  const usedRoleNames = new Set(roles.map((role) => role.roleName));
  return catalog.find((roleName) => !usedRoleNames.has(roleName)) ?? null;
}

export function duplicateRoleNames(roles: readonly ShiftRoleName[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  roles.forEach(({ roleName }) => {
    const normalized = roleName.trim().toLowerCase();
    if (seen.has(normalized)) duplicates.add(roleName.trim());
    else seen.add(normalized);
  });
  return [...duplicates];
}

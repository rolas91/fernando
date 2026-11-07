export interface DashboardShift {
  date: string;
  cancelled?: boolean;
  roles: Array<{ assignedWorkers: string[] }>;
  plannedEquipment?: Array<{ type: string; estimatedQuantity: number }>;
}
export interface DashboardAssignment {
  id: string;
  status: string;
  shifts: DashboardShift[];
}
export function dashboardAllocation(
  workOrders: DashboardAssignment[],
  date: string,
) {
  const todayWorkOrders = workOrders.flatMap((order) => {
    if (
      ['cancelled', 'canceled'].includes(
        String(order.status || '')
          .trim()
          .toLowerCase(),
      )
    )
      return [];
    const shifts = order.shifts.filter(
      (shift) => shift.date === date && !shift.cancelled,
    );
    return shifts.length ? [{ ...order, shifts }] : [];
  });
  const assignedWorkerIds = new Set<string>(),
    plannedEquipmentByType = new Map<string, number>();
  let plannedEquipmentCount = 0;
  for (const order of todayWorkOrders)
    for (const shift of order.shifts) {
      for (const role of shift.roles)
        for (const id of role.assignedWorkers) assignedWorkerIds.add(id);
      for (const item of shift.plannedEquipment || []) {
        const quantity = Math.max(0, Number(item.estimatedQuantity) || 0);
        plannedEquipmentCount += quantity;
        plannedEquipmentByType.set(
          item.type,
          (plannedEquipmentByType.get(item.type) || 0) + quantity,
        );
      }
    }
  return {
    assignedWorkerIds,
    plannedEquipmentCount,
    todayPlannedEquipment: [...plannedEquipmentByType.entries()],
  };
}

import { appDataKey, shouldRetryAppRead } from './appDataQueries';
import {
  dbUpdateIncident,
  dbAddFormSubmission,
  dbDeleteFormSubmission,
  fetchPaged,
  dbAddWorker,
  dbUpdateWorker,
  dbAddProject,
  dbUpdateProject,
  dbAddClient,
  dbUpdateClient,
  dbAddEquipment,
  dbUpdateEquipment,
  dbDeleteEquipment,
  dbAddMaterial,
  dbUpdateMaterial,
  dbDeleteMaterial,
  dbDeleteMaterials,
  type CatalogFilters,
} from './db';
import type {
  Client,
  Equipment,
  Material,
  Worker,
  Project,
  Incident,
  FormSubmission,
} from './types';
export type CatalogResource =
  | 'incidents'
  | 'formSubmissions'
  | 'clients'
  | 'equipment'
  | 'materials'
  | 'workers'
  | 'projects';
export function catalogReadOptions<T>(
  userId: string,
  resource: CatalogResource,
  page: number,
  filters: CatalogFilters,
  pageSize = 25,
) {
  return {
    queryKey: [
      ...appDataKey(userId, resource),
      'page',
      page,
      filters,
      pageSize,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchPaged<T>(resource, page, pageSize, filters, signal),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: shouldRetryAppRead,
  };
}
export function catalogActions(
  resource: CatalogResource,
  rows: unknown[],
  refresh: () => Promise<void>,
) {
  const save = async (operation: () => Promise<unknown>) => {
    await operation();
    await refresh();
  };
  return {
    ...(resource === 'incidents'
      ? {
          incidents: rows as Incident[],
          updateIncident: (id: string, value: Partial<Incident>) =>
            save(() => dbUpdateIncident(id, value)),
          addFormSubmission: (value: FormSubmission) =>
            save(() => dbAddFormSubmission(value)),
        }
      : {}),
    ...(resource === 'formSubmissions'
      ? {
          formSubmissions: rows as FormSubmission[],
          deleteFormSubmission: (id: string) =>
            save(() => dbDeleteFormSubmission(id)),
        }
      : {}),
    ...(resource === 'workers'
      ? {
          workers: rows as Worker[],
          addWorker: (value: Worker) => save(() => dbAddWorker(value)),
          updateWorker: (id: string, value: Partial<Worker>) =>
            save(() => dbUpdateWorker(id, value)),
        }
      : {}),
    ...(resource === 'projects'
      ? {
          projects: rows as Project[],
          addProject: (value: Project) => save(() => dbAddProject(value)),
          updateProject: (id: string, value: Partial<Project>) =>
            save(() => dbUpdateProject(id, value)),
        }
      : {}),
    ...(resource === 'clients'
      ? {
          clients: rows as Client[],
          addClient: (value: Client) => save(() => dbAddClient(value)),
          updateClient: (id: string, value: Partial<Client>) =>
            save(() => dbUpdateClient(id, value)),
        }
      : {}),
    ...(resource === 'equipment'
      ? {
          equipment: rows as Equipment[],
          addEquipment: (value: Equipment) => save(() => dbAddEquipment(value)),
          updateEquipment: (id: string, value: Partial<Equipment>) =>
            save(() => dbUpdateEquipment(id, value)),
          deleteEquipment: (id: string) => save(() => dbDeleteEquipment(id)),
        }
      : {}),
    ...(resource === 'materials'
      ? {
          materials: rows as Material[],
          addMaterial: (value: Material) => save(() => dbAddMaterial(value)),
          updateMaterial: (id: string, value: Partial<Material>) =>
            save(() => dbUpdateMaterial(id, value)),
          deleteMaterial: (id: string) => save(() => dbDeleteMaterial(id)),
          deleteMaterials: async (ids: string[]) => {
            const result = await dbDeleteMaterials(ids);
            await refresh();
            return result.deletedCount;
          },
        }
      : {}),
  };
}

import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  APP_RESOURCES,
  appResourceOptions,
  type AppData,
  type AppResource,
} from '@/lib/appDataQueries';

// Complete shared collections are requested only when a legacy detail/editor needs
// them. They are never seeded from a partial page or removed while other screens use them.
export function useDeferredAppData(
  resources: readonly AppResource[],
  enabled: boolean,
) {
  const { user } = useAuth();
  const descriptors = APP_RESOURCES.filter((resource) =>
    resources.includes(resource.key),
  );
  const results = useQueries({
    queries: descriptors.map((resource) => ({
      ...appResourceOptions(user?.id || 'guest', resource),
      enabled: Boolean(user) && enabled,
    })),
  });
  return {
    data: Object.fromEntries(
      descriptors
        .map((resource, index) => [resource.key, results[index].data])
        .filter(([, value]) => value !== undefined),
    ) as Partial<AppData>,
    ready: !enabled || results.every((result) => result.data !== undefined),
    loading: enabled && results.some((result) => result.isPending),
    error: enabled
      ? results.find((result) => result.error)?.error || null
      : null,
    retry: () => {
      results.forEach((result) => {
        void result.refetch();
      });
    },
  };
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  APP_RESOURCES,
  appDataKey,
  appResourceOptions,
  updateAppResource,
  type AppData,
  type AppResource,
} from '@/lib/appDataQueries';
import { subscribeToChanges } from '@/lib/db';
import type { PageView } from '@/lib/types';
import {
  PAGE_RESOURCES,
  resourcesForPage,
  rangeForPage,
  localDateKey,
} from '@/lib/appDataPages';

export function useAppData(userId: string | undefined, page: PageView) {
  const client = useQueryClient();
  const owner = userId || 'guest';
  const active = useRef(true);
  const [today, setToday] = useState(localDateKey);
  const enabledResources = resourcesForPage(page);
  const range = rangeForPage(page, today);
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timer = setTimeout(
      () => setToday(localDateKey()),
      midnight.getTime() - now.getTime() + 100,
    );
    return () => clearTimeout(timer);
  }, [today]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const results = useQueries({
    queries: APP_RESOURCES.map((resource) => ({
      ...appResourceOptions(owner, resource, range),
      enabled: Boolean(userId) && enabledResources.has(resource.key),
    })),
  });
  const setters = useMemo(
    () =>
      Object.fromEntries(
        APP_RESOURCES.map(({ key }) => [
          key,
          (value: unknown, fallback: unknown) => {
            if (active.current && userId)
              updateAppResource(client, owner, key, value, fallback);
          },
        ]),
      ),
    [client, owner, userId],
  );

  function state<K extends AppResource>(
    key: K,
    fallback: NonNullable<AppData[K]>,
  ): readonly [
    NonNullable<AppData[K]>,
    Dispatch<SetStateAction<NonNullable<AppData[K]>>>,
  ] {
    const index = APP_RESOURCES.findIndex((resource) => resource.key === key);
    return [
      (results[index].data ?? fallback) as NonNullable<AppData[K]>,
      (value) => setters[key](value, fallback),
    ];
  }

  const refreshTable = useCallback(
    async (table: string) => {
      if (!userId || !active.current) return;
      if (
        ['projects', 'clients', 'form_submissions', 'workers', 'work_order_types'].includes(table)
      ) {
        await client.cancelQueries({
          queryKey: appDataKey(owner, 'workOrders'),
          predicate: (query) =>
            ['shifts-page', 'shifts-metrics', 'shift-detail', 'schedule-scope', 'assignments-page', 'assignment-records', 'assignment-record', 'assignment-shift-record', 'conflict-index'].includes(
              String(query.queryKey[3]),
            ),
        });
        if (active.current)
          await client.invalidateQueries({
            queryKey: appDataKey(owner, 'workOrders'),
            predicate: (query) =>
              ['shifts-page', 'shifts-metrics', 'shift-detail', 'schedule-scope', 'assignments-page', 'assignment-records', 'assignment-record', 'assignment-shift-record', 'conflict-index'].includes(
                String(query.queryKey[3]),
              ),
          });
      }
      if (
        [
          'workers',
          'equipment',
          'projects',
          'clients',
          'work_orders',
          'timesheets',
          'incidents',
          'activity_feed',
          'form_submissions',
        ].includes(table)
      ) {
        const queryKey = [...appDataKey(owner, 'workOrders'), 'dashboard'];
        await client.cancelQueries({ queryKey });
        if (active.current) await client.invalidateQueries({ queryKey });
      }
      if (
        [
          'workers',
          'equipment',
          'projects',
          'work_orders',
          'timesheets',
          'incidents',
          'form_templates',
          'form_submissions',
          'company_settings',
        ].includes(table)
      ) {
        const queryKey = [...appDataKey(owner, 'timesheets'), 'reports'];
        await client.cancelQueries({ queryKey });
        if (active.current) await client.invalidateQueries({ queryKey });
      }
      if (
        [
          'workers',
          'projects',
          'work_orders',
          'shifts',
          'company_settings',
        ].includes(table)
      ) {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'timesheets'),
          predicate: (query) => query.queryKey[3] === 'payroll',
        });
      }
      if (
        ['workers', 'projects', 'work_orders', 'form_templates'].includes(table)
      ) {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'formSubmissions'),
          predicate: (query) =>
            ['page', 'count'].includes(String(query.queryKey[3])),
        });
      }
      if (['workers', 'projects'].includes(table)) {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'incidents'),
          predicate: (query) => query.queryKey[3] === 'page',
        });
      }
      if (table === 'timesheets') {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'timesheetSummary'),
        });
      }
      if (['worker_roles', 'certifications', 'skills'].includes(table)) {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'workers'),
        });
      }
      if (
        ['clients', 'work_orders', 'workers', 'status_catalog'].includes(table)
      ) {
        await client.cancelQueries({
          queryKey: appDataKey(owner, 'projects'),
          predicate: (query) =>
            ['page', 'calendar', 'detail'].includes(String(query.queryKey[3])),
        });
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'projects'),
          predicate: (query) =>
            ['page', 'calendar', 'detail'].includes(String(query.queryKey[3])),
        });
      }
      if (table === 'projects') {
        await client.invalidateQueries({
          queryKey: appDataKey(owner, 'clients'),
          predicate: (query) => query.queryKey[3] === 'page',
        });
      }
      const resource = APP_RESOURCES.find((item) => item.table === table);
      if (!resource) return;
      const queryKey = appDataKey(owner, resource.key);
      await client.cancelQueries({ queryKey });
      if (active.current) await client.invalidateQueries({ queryKey });
    },
    [client, owner, userId],
  );

  useEffect(() => {
    active.current = true;
    if (!userId)
      return () => {
        active.current = false;
      };
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleRefresh = (table: string) => {
      if (timers.has(table)) clearTimeout(timers.get(table));
      timers.set(
        table,
        setTimeout(() => {
          timers.delete(table);
          void refreshTable(table);
        }, 200),
      );
    };
    let hasConnected = false;
    const unsubscribe = subscribeToChanges({
      onConnect: () => {
        setRealtimeConnected(true);
        // Refresh cached snapshots on connection and resync after reconnecting.
        APP_RESOURCES.forEach(({ table, key }) => {
          const loaded = client
            .getQueryCache()
            .findAll({ queryKey: appDataKey(owner, key) })
            .some((query) => query.state.data !== undefined);
          if (hasConnected || loaded) scheduleRefresh(table);
        });
        hasConnected = true;
      },
      onDisconnect: () => setRealtimeConnected(false),
      onSettings: () => scheduleRefresh('company_settings'),
      onShifts: () => scheduleRefresh('shifts'),
      onWorkOrderTypes: () => scheduleRefresh('work_order_types'),
      onProjectTypes: () => scheduleRefresh('project_types'),
      onStatusCatalog: () => scheduleRefresh('status_catalog'),
      onCertifications: () => scheduleRefresh('certifications'),
      onSkills: () => scheduleRefresh('skills'),
      onWorkerRoles: () => scheduleRefresh('worker_roles'),
      onWorkers: () => scheduleRefresh('workers'),
      onEquipment: () => scheduleRefresh('equipment'),
      onMaterials: () => scheduleRefresh('materials'),
      onClients: () => scheduleRefresh('clients'),
      onProjects: () => scheduleRefresh('projects'),
      onWorkOrders: () => scheduleRefresh('work_orders'),
      onCommercialCatalogItems: () =>
        scheduleRefresh('commercial_catalog_items'),
      onCommercialInvoices: () => scheduleRefresh('commercial_invoices'),
      onCommercialWorkOrders: () => scheduleRefresh('commercial_work_orders'),
      onTimesheets: () => scheduleRefresh('timesheets'),
      onFormTemplates: () => scheduleRefresh('form_templates'),
      onFormSubmissions: () => scheduleRefresh('form_submissions'),
      onIncidents: () => scheduleRefresh('incidents'),
      onNotifications: () => scheduleRefresh('notifications'),
      onActivityFeed: () => scheduleRefresh('activity_feed'),
      onAvailabilityRequests: () => scheduleRefresh('availability_requests'),
    });
    return () => {
      active.current = false;
      timers.forEach(clearTimeout);
      unsubscribe();
      void client.cancelQueries({ queryKey: appDataKey(owner) });
      client.removeQueries({ queryKey: appDataKey(owner) });
    };
  }, [client, owner, refreshTable, userId]);

  const retryFailed = useCallback(async () => {
    await client.refetchQueries({
      queryKey: appDataKey(owner),
      predicate: (query) => query.isActive() && query.state.status === 'error',
    });
  }, [client, owner]);
  const readyMask = results
    .map((result, index) =>
      result.data !== undefined &&
      !(range && APP_RESOURCES[index].key === 'workOrders')
        ? '1'
        : '0',
    )
    .join('');
  const resourceReady = useCallback(
    (key: AppResource) =>
      readyMask[APP_RESOURCES.findIndex((resource) => resource.key === key)] ===
      '1',
    [readyMask],
  );

  return {
    state,
    refreshTable,
    resourceReady,
    retryFailed,
    isLoading:
      Boolean(userId) &&
      results.some(
        (result, index) =>
          enabledResources.has(APP_RESOURCES[index].key) &&
          result.isPending &&
          result.fetchStatus !== 'idle',
      ),
    isDbConnected:
      Boolean(userId) && results.some((result) => result.isSuccess),
    realtimeConnected,
    pageDataReady: PAGE_RESOURCES[page].every(
      (key) =>
        results[APP_RESOURCES.findIndex((resource) => resource.key === key)]
          .data !== undefined,
    ),
    loadErrors: userId
      ? APP_RESOURCES.filter(
          (resource, index) =>
            enabledResources.has(resource.key) && results[index].isError,
        ).map(({ label }) => label)
      : [],
  };
}

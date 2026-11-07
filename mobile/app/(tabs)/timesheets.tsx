import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  type AssignmentListItem,
  type AssignmentShift,
} from '@/lib/assignments-service';

const WORK_ORDER_FORM_HREF = '/work-orders/form';

type TimesheetShift = {
  assignment: AssignmentListItem;
  shift: AssignmentShift;
};

type TimesheetFilter = 'all' | 'pending' | 'completed';

const FILTERS: { id: TimesheetFilter; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

function fullDateLabel(iso?: string) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function statusStyles(completed?: boolean) {
  return completed
    ? { bg: '#dcfce7', text: '#15803d', label: 'Completed' }
    : { bg: '#fef3c7', text: '#b45309', label: 'Pending' };
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftStartMinutes(value?: string) {
  const match = value
    ?.trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*([AP])\.?M\.?)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute < 0 || minute > 59) return Number.MAX_SAFE_INTEGER;

  if (period) {
    if (hour < 1 || hour > 12) return Number.MAX_SAFE_INTEGER;
    if (period === 'A' && hour === 12) hour = 0;
    if (period === 'P' && hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 23) {
    return Number.MAX_SAFE_INTEGER;
  }

  return hour * 60 + minute;
}

function compareShiftDatesFromToday(
  left: string,
  right: string,
  today: string,
) {
  const leftIsPast = left < today;
  const rightIsPast = right < today;
  if (leftIsPast !== rightIsPast) return leftIsPast ? 1 : -1;
  return leftIsPast ? right.localeCompare(left) : left.localeCompare(right);
}

export default function TimesheetsScreen() {
  const { themeColor } = useNativeTheme();
  const { token, hasPermission, user } = useAuth();
  const canSubmitTimesheets = hasPermission('mobile.timesheets.submit');
  const isViewerUser = (user?.role || '').toLowerCase() === 'viewer';
  const isAdminUser =
    user?.role === 'admin' || Boolean(user?.roles?.includes('admin'));
  const canEditOwnTimesheet = (shift: AssignmentShift) =>
    !isViewerUser || isAdminUser || Boolean(shift.canManageWorkOrder);
  const timesheetEditingRestricted = isViewerUser && !isAdminUser;
  const [filter, setFilter] = useState<TimesheetFilter>('pending');
  const [openingShiftId, setOpeningShiftId] = useState<string | null>(null);
  const openingShiftRef = useRef<string | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-timesheet-assignments', token],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const refetchAssignments = assignmentsQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      openingShiftRef.current = null;
      setOpeningShiftId(null);
      if (token) void refetchAssignments();
    }, [refetchAssignments, token]),
  );

  const shifts = useMemo<TimesheetShift[]>(() => {
    const rows = assignmentsQuery.data ?? [];
    const today = localDateKey(new Date());
    return rows
      .flatMap((assignment) =>
        assignment.shifts.map((shift) => ({ assignment, shift })),
      )
      .filter((item) => {
        if (filter === 'completed') return Boolean(item.shift.completed);
        if (filter === 'pending') return !item.shift.completed;
        return true;
      })
      .sort(
        (a, b) =>
          compareShiftDatesFromToday(a.shift.date, b.shift.date, today) ||
          shiftStartMinutes(a.shift.startTime) -
            shiftStartMinutes(b.shift.startTime),
      );
  }, [assignmentsQuery.data, filter]);

  const openTimesheet = (item: TimesheetShift) => {
    if (openingShiftRef.current) return;
    if (!canSubmitTimesheets) return;
    openingShiftRef.current = item.shift.id;
    setOpeningShiftId(item.shift.id);
    router.push({
      pathname: WORK_ORDER_FORM_HREF,
      params: {
        assignmentId: item.assignment.id,
        workOrderId: item.assignment.id,
        shiftId: item.shift.id,
        projectId: item.assignment.projectId,
        category: 'timesheet',
        scheduledStartTime: item.shift.startTime,
        scheduledEndTime: item.shift.endTime,
      },
    });
  };

  return (
    <SafeAreaView
      edges={['left', 'right']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader
        title="Timesheets"
        subtitle={
          isViewerUser && !isAdminUser
            ? 'My shifts • View your timesheet. Editing is limited to the Work Order manager or an administrator'
            : 'My shifts • Open and submit your own timesheet row for each assigned shift'
        }
        showBack={false}
      />

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={
              assignmentsQuery.isRefetching && !assignmentsQuery.isLoading
            }
            onRefresh={() => assignmentsQuery.refetch()}
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 24,
        }}
      >
        {!canSubmitTimesheets ? (
          <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <Text className="text-base font-bold text-slate-800 dark:text-slate-100">
              Read-only access
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              Your role can view timesheets but cannot submit them.
            </Text>
          </View>
        ) : null}

        {timesheetEditingRestricted ? (
          <View className="mb-3 rounded-2xl border border-amber-200 dark:border-[#92400e] bg-amber-50 dark:bg-[#451a03] p-4">
            <Text className="text-base font-bold text-amber-800 dark:text-[#fcd34d]">
              Timesheet editing restricted
            </Text>
            <Text className="mt-1 text-sm leading-5 text-amber-700 dark:text-[#fcd34d]">
              Only the Work Order manager or an administrator can enter
              timesheet hours. Open a shift to view it; if you are that
              shift&apos;s Work Order manager, you can still edit it.
            </Text>
          </View>
        ) : null}

        {assignmentsQuery.isLoading ? (
          <View className="items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <ActivityIndicator color="#CC0000" />
            <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Loading timesheets...
            </Text>
          </View>
        ) : null}

        {!assignmentsQuery.isLoading && shifts.length === 0 ? (
          <View className="items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <Ionicons name="time-outline" size={32} color="#94a3b8" />
            <Text className="mt-2 text-base font-bold text-slate-800 dark:text-slate-100">
              No timesheets found
            </Text>
            <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
              Timesheets will appear here when you have assigned shifts for this
              filter.
            </Text>
          </View>
        ) : null}

        {!assignmentsQuery.isLoading ? (
          <View className="mb-3 flex-row rounded-2xl bg-white dark:bg-slate-800 p-1">
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setFilter(item.id)}
                  className={`flex-1 items-center rounded-xl px-3 py-2 ${active ? 'bg-[#1c2e4a]' : 'bg-transparent'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    className={`text-xs font-extrabold ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View className="gap-3">
          {shifts.map((item) => {
            const badge = statusStyles(item.shift.completed);
            const isOpening = openingShiftId === item.shift.id;
            return (
              <Pressable
                key={`${item.assignment.id}-${item.shift.id}`}
                disabled={!canSubmitTimesheets || Boolean(openingShiftId)}
                onPress={() => openTimesheet(item)}
                className={`rounded-2xl border bg-white dark:bg-slate-800 p-4 active:opacity-90 disabled:opacity-60 ${
                  isOpening
                    ? 'border-[#CC0000]'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !canSubmitTimesheets || Boolean(openingShiftId),
                  busy: isOpening,
                }}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                      {item.assignment.orderNumber || item.assignment.id}
                    </Text>
                    <Text className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-200">
                      {item.assignment.projectName || item.assignment.title}
                    </Text>
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.shift.shiftName} · {fullDateLabel(item.shift.date)}{' '}
                      - {item.shift.startTime} to {item.shift.endTime}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {item.shift.roleName || 'Assigned role'}
                    </Text>
                    {!canEditOwnTimesheet(item.shift) ? (
                      <View className="mt-1 flex-row items-center gap-1">
                        <Ionicons
                          name="lock-closed-outline"
                          size={12}
                          color={themeColor('#b45309')}
                        />
                        <Text className="text-[11px] font-semibold text-amber-700 dark:text-[#fcd34d]">
                          View only
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    className="rounded-full px-3 py-1"
                    style={{
                      backgroundColor: themeColor(badge.bg, 'background'),
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: themeColor(badge.text, 'text') }}
                    >
                      {badge.label}
                    </Text>
                  </View>
                </View>
                <View className="mt-3 flex-row items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-2">
                  <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isOpening
                      ? 'Opening timesheet...'
                      : item.assignment.location || 'No location'}
                  </Text>
                  {isOpening ? (
                    <ActivityIndicator size="small" color="#CC0000" />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#94a3b8"
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { CancellationConfirmButton } from '@/components/cancellation-confirm-button';
import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { NotificationBell } from '@/components/notification-bell';
import { DeclineShiftModal } from '@/components/decline-shift-modal';

import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  fetchPaginatedShifts,
  updateAssignmentShiftConfirmation,
  type AssignmentListItem,
  type AssignmentShift,
} from '@/lib/assignments-service';
import {
  deleteMobileNotification,
  fetchMobileNotifications,
  markMobileNotificationRead,
  type MobileNotification,
} from '@/lib/notifications-service';
import {
  canRespondToShift,
  isShiftNoResponse,
  useShiftResponseClock,
} from '@/lib/shift-response';
import { shiftChatHref, shiftDetailHref } from '@/lib/notification-deep-link';

type AssignmentListFilter = 'all' | 'upcoming' | 'this_week' | 'completed';

const ASSIGNMENT_LIST_FILTERS: {
  id: AssignmentListFilter;
  label: string;
}[] = [
  { id: 'this_week', label: 'This Week' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

function monthDay(iso: string) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function dateRangeLabel(item: AssignmentListItem) {
  const start = monthDay(item.startDate);
  const end = monthDay(item.endDate);
  if (!start && !end) return '';
  if (!end || start === end) return start;
  return `${start} - ${end}`;
}

function parseLocalDate(iso: string) {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftStartTimeLabel(value?: string) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return value?.trim() || 'Not set';

  let hour = Number(match[1]);
  const minute = match[2];
  const suppliedPeriod = match[3]?.toUpperCase();

  if (suppliedPeriod) {
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${suppliedPeriod}`;
  }

  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function projectCode(item: AssignmentListItem) {
  const raw = item.projectNumber?.trim();
  if (!raw) return '';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function projectNumberAndName(item: AssignmentListItem) {
  const number = item.projectNumber?.trim().replace(/^#/, '');
  const name = (item.projectName || item.title)?.trim();
  return [number, name].filter(Boolean).join(' - ');
}

function pendingShifts(item: AssignmentListItem) {
  return item.shifts.filter((shift) => canRespondToShift(shift));
}

function shiftStatusStyles(shift: AssignmentShift) {
  if (isShiftNoResponse(shift)) {
    return {
      backgroundColor: '#E2E8F0',
      textColor: '#334155',
      label: 'No Response',
    };
  }
  if (shift.completed || shift.effectiveStatus === 'shift_completed') {
    return {
      backgroundColor: '#E2E8F0',
      textColor: '#1E293B',
      label: 'Shift Completed',
    };
  }
  if (shift.effectiveStatus === 'pm_approved') {
    return {
      backgroundColor: '#14B8A6',
      textColor: '#FFFFFF',
      label: 'PM Approved',
    };
  }
  if (shift.effectiveStatus === 'shift_cancelled') {
    return {
      backgroundColor: '#FEE2E2',
      textColor: '#991B1B',
      label: 'Shift Cancelled',
    };
  }
  if (shift.confirmationStatus === 'declined') {
    return {
      backgroundColor: '#FEE2E2',
      textColor: '#991B1B',
      label: 'Declined',
    };
  }
  if (shift.confirmationStatus === 'confirmed') {
    return {
      backgroundColor: '#DCFCE7',
      textColor: '#166534',
      label: 'Confirmed',
    };
  }
  if (shift.confirmationStatus === 'pending' && shift.confirmationRequested) {
    return {
      backgroundColor: '#FFEDD5',
      textColor: '#9A3412',
      label: 'Action Required',
    };
  }
  switch (shift.effectiveStatus) {
    case 'workers_confirmed':
      return {
        backgroundColor: '#DCFCE7',
        textColor: '#166534',
        label: 'Workers Confirmed',
      };
    default:
      return null;
  }
}

function shiftDateHeading(iso: string) {
  const date = parseLocalDate(iso);
  if (!date) return iso;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const prefix =
    date.toDateString() === today.toDateString()
      ? 'Today  •  '
      : date.toDateString() === tomorrow.toDateString()
        ? 'Tomorrow  •  '
        : '';

  return `${prefix}${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

function notificationTimeLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function ShiftCard({
  assignment,
  shift,
  isUpdating,
  onOpen,
  isOpening,
}: {
  assignment: AssignmentListItem;
  shift: AssignmentShift;
  isUpdating: boolean;
  isOpening: boolean;
  onOpen: () => void;
}) {
  const { themeColor } = useNativeTheme();
  const status = shiftStatusStyles(shift);
  const [clock, period] = shiftStartTimeLabel(shift.startTime).split(' ');

  return (
    <Pressable
      disabled={isOpening || isUpdating}
      onPress={onOpen}
      className="bg-white dark:bg-slate-800 px-3 py-4 active:bg-slate-50 dark:active:bg-slate-900 disabled:opacity-70"
    >
      <View className="flex-row items-stretch">
        <View className="h-[74px] w-[68px] items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-900">
          <Text className="text-[19px] font-extrabold text-slate-950 dark:text-slate-100">
            {clock}
          </Text>
          <Text className="mt-0.5 text-[16px] font-extrabold text-slate-950 dark:text-slate-100">
            {period || ''}
          </Text>
        </View>

        <View className="ml-3 min-w-0 flex-1">
          {shift.shiftName?.trim() ? (
            <Text
              className="text-[16px] font-extrabold leading-5 text-[#071535] dark:text-slate-100"
              numberOfLines={2}
            >
              {shift.shiftName.trim()}
            </Text>
          ) : null}
          <Text
            className={`${shift.shiftName?.trim() ? 'mt-0.5' : ''} text-[16px] font-extrabold leading-5 text-[#071535] dark:text-slate-100`}
            numberOfLines={2}
          >
            {projectNumberAndName(assignment)}
          </Text>
          <View className="mt-1 flex-row items-start gap-1.5">
            <Ionicons
              name="location-outline"
              size={15}
              color={themeColor('#64748b')}
            />
            <Text
              className="min-w-0 flex-1 text-[13px] leading-[18px] text-slate-600 dark:text-slate-200"
              numberOfLines={2}
            >
              {assignment.location || 'No location'}
            </Text>
          </View>
          {status ? (
            <View
              className="mt-2 self-start rounded-full px-3 py-1.5"
              style={{
                backgroundColor: themeColor(
                  status.backgroundColor,
                  'background',
                ),
              }}
            >
              <Text
                className="text-[11px] font-extrabold"
                style={{ color: themeColor(status.textColor, 'text') }}
              >
                {status.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="ml-2 w-7 items-center justify-center">
          {isOpening || isUpdating ? (
            <ActivityIndicator size="small" color={themeColor('#1c2e4a')} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={22}
              color={themeColor('#334155')}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function AssignmentsListScreen() {
  const { themeColor } = useNativeTheme();
  useShiftResponseClock();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { token, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canConfirmAssignments = hasPermission('mobile.shifts.confirm');
  const [query, setQuery] = useState('');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentListFilter>('this_week');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentListItem | null>(null);
  const [declineConfirmationOpen, setDeclineConfirmationOpen] = useState(false);
  const [openingAssignmentId, setOpeningAssignmentId] = useState<string | null>(
    null,
  );
  const assignmentsQuery = useInfiniteQuery({
    queryKey: [
      'mobile-assignments',
      'paginated-v2',
      token,
      assignmentFilter,
      query,
    ],
    enabled: Boolean(token),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchPaginatedShifts({
        token: token as string,
        filter: assignmentFilter,
        page: pageParam,
        limit: 20,
        search: query,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
  const notificationsQuery = useQuery({
    queryKey: ['mobile-notifications', token],
    enabled: Boolean(token),
    queryFn: () => fetchMobileNotifications(token as string),
  });
  const notificationAssignmentsQuery = useQuery({
    queryKey: ['mobile-notification-assignments', token],
    enabled: Boolean(token && notificationsOpen),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const refetchAssignments = assignmentsQuery.refetch;

  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!token) throw new Error('Missing session token.');
      return markMobileNotificationRead(token, notificationId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-notifications'],
      });
    },
  });
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!token) throw new Error('Missing session token.');
      return deleteMobileNotification(token, notificationId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-notifications'],
      });
    },
  });

  const confirmationMutation = useMutation({
    mutationFn: async (params: {
      assignmentId: string;
      shiftId: string;
      status: 'confirmed' | 'declined';
    }) => {
      if (!token) throw new Error('Missing session token.');
      console.log('[mobile assignments] confirming shift', params);
      return updateAssignmentShiftConfirmation({ token, ...params });
    },
    onSuccess: async (assignment, variables) => {
      if (variables.status === 'declined') setDeclineConfirmationOpen(false);
      console.log('[mobile assignments] confirmation success', {
        assignmentId: assignment.id,
        pendingShifts: pendingShifts(assignment).length,
        shifts: assignment.shifts.map((shift) => ({
          id: shift.id,
          date: shift.date,
          status: shift.confirmationStatus,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-notification-assignments'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-notifications'],
      });
      setSelectedAssignment((current) => {
        if (!current || current.id !== assignment.id) return current;
        if (variables.status === 'declined') return null;
        return pendingShifts(assignment).length > 0 ? assignment : null;
      });
    },
    onError: (error) => {
      console.log('[mobile assignments] confirmation failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const loadedAssignments = useMemo(
    () =>
      (assignmentsQuery.data?.pages ?? [])
        .flatMap((page) => (Array.isArray(page?.items) ? page.items : []))
        .filter((assignment): assignment is AssignmentListItem =>
          Boolean(assignment && Array.isArray(assignment.shifts)),
        ),
    [assignmentsQuery.data?.pages],
  );
  const groupedShifts = useMemo(() => {
    const today = localDateKey(new Date());
    const groups = new Map<
      string,
      { assignment: AssignmentListItem; shift: AssignmentShift }[]
    >();
    loadedAssignments
      .flatMap((assignment) =>
        assignment.shifts
          .filter((shift): shift is AssignmentShift => Boolean(shift))
          .map((shift) => ({ assignment, shift })),
      )
      .sort(
        (a, b) =>
          compareShiftDatesFromToday(a.shift.date, b.shift.date, today) ||
          shiftStartMinutes(a.shift.startTime) -
            shiftStartMinutes(b.shift.startTime),
      )
      .forEach((row) => {
        const rows = groups.get(row.shift.date) ?? [];
        rows.push(row);
        groups.set(row.shift.date, rows);
      });
    return Array.from(groups.entries()).map(([date, rows]) => ({ date, rows }));
  }, [loadedAssignments]);
  const notifications = notificationsQuery.data ?? [];
  const errorMessage =
    (assignmentsQuery.error instanceof Error
      ? assignmentsQuery.error.message
      : '') ||
    (confirmationMutation.error instanceof Error
      ? confirmationMutation.error.message
      : '') ||
    (notificationsQuery.error instanceof Error
      ? notificationsQuery.error.message
      : '');
  const updatingId = confirmationMutation.variables?.assignmentId ?? null;

  const assignmentForNotification = (notification: MobileNotification) => {
    const assignmentId = notification.workOrderId || notification.link || '';
    if (!assignmentId) return null;
    return (
      (notificationAssignmentsQuery.data ?? loadedAssignments).find(
        (item) => item.id === assignmentId,
      ) ?? null
    );
  };

  const handleConfirmation = (
    assignment: AssignmentListItem,
    status: 'confirmed' | 'declined',
  ) => {
    if (!canConfirmAssignments) {
      Alert.alert(
        'Read-only access',
        'Your role can view assignments, but cannot update shift confirmations.',
      );
      return;
    }
    const pending = pendingShifts(assignment);
    console.log('[mobile assignments] confirmation tapped', {
      assignmentId: assignment.id,
      status,
      pendingShiftIds: pending.map((shift) => shift.id),
    });
    if (!token || pending.length === 0) return;
    confirmationMutation.mutate({
      assignmentId: assignment.id,
      shiftId: pending[0].id,
      status,
    });
  };

  const goToDetail = (
    assignment: AssignmentListItem,
    shiftId?: string,
    notificationId?: string,
  ) => {
    if (openingAssignmentId) return;
    setOpeningAssignmentId(assignment.id);
    router.push(
      shiftDetailHref({
        assignmentId: assignment.id,
        shiftId,
        notificationId,
      }),
    );
  };

  useFocusEffect(
    useCallback(() => {
      setOpeningAssignmentId(null);
      if (token) {
        void refetchAssignments();
      }
    }, [refetchAssignments, token]),
  );

  const handleNotificationPress = (notification: MobileNotification) => {
    if (!notification.read) {
      markNotificationReadMutation.mutate(notification.id);
    }

    const assignment = assignmentForNotification(notification);
    if (!assignment) {
      Alert.alert(
        'Assignment unavailable',
        'This notification is not linked to an available assignment.',
      );
      return;
    }

    if (notification.type === 'shift_chat_message' && notification.shiftId) {
      setNotificationsOpen(false);
      router.push(
        shiftChatHref({
          assignmentId: assignment.id,
          shiftId: notification.shiftId,
          title: notification.title || 'Shift Chat',
        }),
      );
      return;
    }

    if (pendingShifts(assignment).length > 0) {
      setNotificationsOpen(false);
      setSelectedAssignment(assignment);
      return;
    }

    setNotificationsOpen(false);
    goToDetail(assignment, notification.shiftId ?? undefined, notification.id);
  };

  const handleDeleteNotification = (notification: MobileNotification) => {
    deleteNotificationMutation.mutate(notification.id);
  };

  return (
    <SafeAreaView
      edges={['left', 'right']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent />
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 bg-[#1c2e4a]"
        style={{ height: insets.top + 220 }}
      />
      <ScrollView
        className="flex-1"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const distanceFromBottom =
            nativeEvent.contentSize.height -
            (nativeEvent.contentOffset.y +
              nativeEvent.layoutMeasurement.height);
          if (
            distanceFromBottom < 160 &&
            assignmentsQuery.hasNextPage &&
            !assignmentsQuery.isFetchingNextPage
          ) {
            void assignmentsQuery.fetchNextPage();
          }
        }}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={
              assignmentsQuery.isRefetching &&
              !assignmentsQuery.isFetchingNextPage &&
              !assignmentsQuery.isLoading
            }
            onRefresh={() => void assignmentsQuery.refetch()}
          />
        }
      >
        <View
          className="bg-[#1c2e4a] px-5 pb-8 rounded-b-[28px] overflow-hidden"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="absolute -right-14 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-red-500">
                <Text className="text-sm font-bold text-white">DR</Text>
              </View>
              <View>
                <Text className="text-white font-semibold text-base">
                  DR Traffic Control
                </Text>
                <Text className="text-slate-100 text-[11px]">
                  Operations Management Platform
                </Text>
              </View>
            </View>
            <NotificationBell />
          </View>
        </View>

        <View className="-mt-4 px-4">
          <View className="rounded-t-[24px] bg-white dark:bg-slate-800 px-4 pb-4 pt-5 shadow-sm border border-slate-200 dark:border-slate-700 border-b-0">
            <Text className="text-[28px] font-extrabold text-[#071535] dark:text-slate-100">
              My Shifts
            </Text>

            <View className="mt-4 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              <Ionicons
                name="search-outline"
                size={22}
                color={themeColor('#334155')}
              />
              <TextInput
                className="ml-2 flex-1 text-base text-slate-800 dark:text-slate-100 py-0"
                placeholder="Search by project, assignment or keyword..."
                placeholderTextColor="#94a3b8"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
            >
              {ASSIGNMENT_LIST_FILTERS.map((item) => {
                const active = assignmentFilter === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setAssignmentFilter(item.id)}
                    className={`h-12 flex-row items-center gap-2 rounded-xl border px-5 active:opacity-90 ${
                      active
                        ? 'border-[#1c2e4a] bg-[#1c2e4a]'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      className={`text-base font-extrabold ${active ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View className="pb-4 pt-3">
            {assignmentsQuery.isLoading ? (
              <View className="rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 items-center">
                <ActivityIndicator color="#CC0000" />
                <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Loading assignments...
                </Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View className="rounded-[20px] border border-red-100 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a] p-4">
                <Text className="text-sm font-semibold text-red-700 dark:text-[#fca5a5]">
                  {errorMessage}
                </Text>
                <Pressable
                  onPress={() => void assignmentsQuery.refetch()}
                  className="mt-3 self-start rounded-xl bg-red-600 px-4 py-2"
                >
                  <Text className="text-sm font-bold text-white">Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {!assignmentsQuery.isLoading &&
              !errorMessage &&
              groupedShifts.map((group) => (
                <View
                  key={group.date}
                  className="mb-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <View className="flex-row items-center justify-between bg-[#F7F8FC] dark:bg-slate-900 px-4 py-3">
                    <Text className="text-[16px] font-extrabold text-[#071535] dark:text-slate-100">
                      {shiftDateHeading(group.date)}
                    </Text>
                    <View className="rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5">
                      <Text className="text-xs font-extrabold text-[#071535] dark:text-slate-100">
                        {group.rows.length}{' '}
                        {group.rows.length === 1 ? 'Shift' : 'Shifts'}
                      </Text>
                    </View>
                  </View>
                  {group.rows.map(({ assignment, shift }, index) => (
                    <View
                      key={`${assignment.id}-${shift.id}`}
                      className={
                        index > 0
                          ? 'border-t border-slate-100 dark:border-slate-700'
                          : ''
                      }
                    >
                      <ShiftCard
                        assignment={assignment}
                        shift={shift}
                        isUpdating={
                          confirmationMutation.isPending &&
                          updatingId === assignment.id
                        }
                        isOpening={openingAssignmentId === assignment.id}
                        onOpen={() => goToDetail(assignment, shift.id)}
                      />
                    </View>
                  ))}
                </View>
              ))}

            {!assignmentsQuery.isLoading &&
            !errorMessage &&
            groupedShifts.length === 0 ? (
              <View className="rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 items-center">
                <Ionicons name="calendar-outline" size={28} color="#94a3b8" />
                <Text className="mt-2 text-base font-bold text-slate-800 dark:text-slate-100">
                  No shifts found
                </Text>
                <Text className="mt-1 text-sm text-center text-slate-500 dark:text-slate-400">
                  Assigned shifts for your worker profile will appear here.
                </Text>
              </View>
            ) : null}

            {assignmentsQuery.isFetchingNextPage ? (
              <View className="items-center py-5">
                <ActivityIndicator color="#CC0000" />
                <Text className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Loading more shifts...
                </Text>
              </View>
            ) : null}

            {!assignmentsQuery.isLoading &&
            groupedShifts.length > 0 &&
            !assignmentsQuery.hasNextPage ? (
              <Text className="py-4 text-center text-sm font-semibold text-slate-400">
                No more shifts
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={notificationsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <View
          className="flex-1 items-center justify-center bg-slate-950/50 px-4"
          style={{
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View className="w-full max-h-[78%] rounded-[8px] bg-white dark:bg-slate-800 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Notifications
              </Text>
              <Pressable
                onPress={() => setNotificationsOpen(false)}
                className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={themeColor('#334155')}
                />
              </Pressable>
            </View>

            <ScrollView
              className="mt-3"
              contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
            >
              {notificationsQuery.isLoading ? (
                <View className="items-center rounded-[8px] border border-slate-200 dark:border-slate-700 p-5">
                  <ActivityIndicator color="#CC0000" />
                  <Text className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Loading notifications...
                  </Text>
                </View>
              ) : null}

              {!notificationsQuery.isLoading && notifications.length === 0 ? (
                <View className="items-center rounded-[8px] border border-slate-200 dark:border-slate-700 p-5">
                  <Ionicons
                    name="notifications-outline"
                    size={26}
                    color="#94a3b8"
                  />
                  <Text className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    No notifications yet
                  </Text>
                </View>
              ) : null}

              {notifications.map((notification) => {
                const assignment = assignmentForNotification(notification);
                const pendingCount = assignment
                  ? pendingShifts(assignment).length
                  : 0;
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => handleNotificationPress(notification)}
                    className={`rounded-[8px] border p-3 active:opacity-90 ${
                      notification.read
                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        : 'border-red-100 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a]'
                    }`}
                  >
                    <View className="flex-row items-start gap-3">
                      <View
                        className={`mt-1 h-2.5 w-2.5 rounded-full ${notification.read ? 'bg-slate-300 dark:bg-slate-800' : 'bg-red-600'}`}
                      />
                      <View className="flex-1">
                        <View className="flex-row items-start justify-between gap-3">
                          <Text
                            className="max-w-[52%] text-sm font-extrabold text-slate-900 dark:text-slate-100"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {notification.type === 'shift_chat_message'
                              ? notification.title
                              : assignment && projectCode(assignment)
                                ? `Project ${projectCode(assignment)}`
                                : notification.title}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {notificationTimeLabel(
                                notification.timestamp ||
                                  notification.createdAt,
                              )}
                            </Text>
                            <CancellationConfirmButton
                              notification={notification}
                            />
                            <Pressable
                              hitSlop={8}
                              disabled={deleteNotificationMutation.isPending}
                              onPress={(event) => {
                                event.stopPropagation();
                                handleDeleteNotification(notification);
                              }}
                              className="h-8 w-8 items-center justify-center rounded-lg bg-white/80 active:bg-red-100 dark:active:bg-[#450a0a] disabled:opacity-50"
                              accessibilityRole="button"
                              accessibilityLabel="Delete notification"
                            >
                              {deleteNotificationMutation.isPending &&
                              deleteNotificationMutation.variables ===
                                notification.id ? (
                                <ActivityIndicator
                                  size="small"
                                  color={themeColor('#DC2626')}
                                />
                              ) : (
                                <Ionicons
                                  name="trash-outline"
                                  size={17}
                                  color={themeColor('#DC2626')}
                                />
                              )}
                            </Pressable>
                          </View>
                        </View>
                        {notification.type !== 'shift_chat_message' ? (
                          <Text
                            className="mt-1 max-w-[52%] text-sm font-semibold text-slate-700 dark:text-slate-200"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {assignment?.title || notification.message}
                          </Text>
                        ) : null}
                        <Text
                          className="mt-1 max-w-[52%] text-xs leading-5 text-slate-500 dark:text-slate-400"
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {notification.message}
                        </Text>
                        {pendingCount > 0 ? (
                          <View className="mt-2 self-start rounded-full bg-amber-100 dark:bg-[#451a03] px-2.5 py-1">
                            <Text className="text-[10px] font-extrabold uppercase text-amber-800 dark:text-[#fcd34d]">
                              {pendingCount} pending{' '}
                              {pendingCount === 1 ? 'shift' : 'shifts'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(selectedAssignment) && !declineConfirmationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAssignment(null)}
      >
        <View
          className="flex-1 items-center justify-center bg-slate-950/50 px-4"
          style={{
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          {selectedAssignment ? (
            <View className="w-full rounded-[8px] bg-white dark:bg-slate-800 p-4">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    {projectCode(selectedAssignment)
                      ? `Project ${projectCode(selectedAssignment)}`
                      : selectedAssignment.projectName ||
                        selectedAssignment.title}
                  </Text>
                  <Text className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
                    {selectedAssignment.title}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
                    {selectedAssignment.projectName
                      ? `${selectedAssignment.projectName}  Â·  `
                      : ''}
                    {dateRangeLabel(selectedAssignment)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelectedAssignment(null)}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900"
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={themeColor('#334155')}
                  />
                </Pressable>
              </View>

              <View className="mt-3 flex-row items-center gap-2">
                <Ionicons
                  name="location"
                  size={16}
                  color={themeColor('#DC2626')}
                />
                <Text className="flex-1 text-sm text-slate-600 dark:text-slate-200">
                  {selectedAssignment.location || 'No location'}
                </Text>
              </View>

              <View className="mt-4 rounded-lg bg-blue-50 dark:bg-[#172554] px-3 py-2.5">
                <Text className="text-xs leading-5 text-slate-700 dark:text-slate-200">
                  <Text className="font-extrabold">
                    You have {pendingShifts(selectedAssignment).length} pending{' '}
                    {pendingShifts(selectedAssignment).length === 1
                      ? 'shift'
                      : 'shifts'}
                    .
                  </Text>{' '}
                  Confirm your shift to notify the scheduling team.
                </Text>
              </View>

              <View className="mt-4 flex-row gap-3">
                <Pressable
                  disabled={
                    !canConfirmAssignments || confirmationMutation.isPending
                  }
                  onPress={() => setDeclineConfirmationOpen(true)}
                  className="flex-1 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-3.5 active:opacity-90"
                >
                  <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                    Decline Shift
                  </Text>
                </Pressable>
                <Pressable
                  disabled={
                    !canConfirmAssignments ||
                    confirmationMutation.isPending ||
                    pendingShifts(selectedAssignment).length === 0
                  }
                  onPress={() =>
                    handleConfirmation(selectedAssignment, 'confirmed')
                  }
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-[#CC0000] py-3.5 active:opacity-90 disabled:opacity-60"
                >
                  {confirmationMutation.isPending &&
                  updatingId === selectedAssignment.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text className="text-sm font-extrabold text-white">
                        Confirm{' '}
                        {pendingShifts(selectedAssignment).length === 1
                          ? 'Shift'
                          : 'Next Shift'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <DeclineShiftModal
        visible={declineConfirmationOpen}
        pending={
          confirmationMutation.isPending &&
          confirmationMutation.variables?.status === 'declined'
        }
        onKeep={() => setDeclineConfirmationOpen(false)}
        onDecline={() => {
          if (selectedAssignment)
            handleConfirmation(selectedAssignment, 'declined');
        }}
      />
    </SafeAreaView>
  );
}

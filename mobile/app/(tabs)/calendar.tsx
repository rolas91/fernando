import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  type AssignmentListItem,
  type AssignmentShift,
} from '@/lib/assignments-service';
import { NotificationBell } from '@/components/notification-bell';
import { isShiftNoResponse, useShiftResponseClock } from '@/lib/shift-response';

const ASSIGNMENT_DETAIL_PATH = '/work-orders';
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type CalendarFilter = 'all' | 'upcoming' | 'this_week' | 'completed';
type CalendarStatus =
  | 'action_required'
  | 'no_response'
  | 'confirmed'
  | 'declined'
  | 'workers_confirmed'
  | 'shift_cancelled'
  | 'shift_completed'
  | 'pm_approved';
type ShiftRow = {
  assignment: AssignmentListItem;
  shift: AssignmentShift;
  status: CalendarStatus | null;
};

const FILTERS: { id: CalendarFilter; label: string }[] = [
  { id: 'this_week', label: 'This Week' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

const CALENDAR_HORIZONTAL_PADDING = 32;
const CALENDAR_BORDER_PX = 1;

function getCalendarDayWidth(): number {
  const screenWidth = Dimensions.get('window').width;
  const usable = Math.max(0, screenWidth - CALENDAR_HORIZONTAL_PADDING);
  return Math.floor(usable / 7) - CALENDAR_BORDER_PX;
}

function parseLocalDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0);
}

function monthTitle(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function fullDateLabel(iso: string) {
  const date = parseLocalDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function timeToMinutes(value?: string) {
  if (!value) return 0;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function durationLabel(start?: string, end?: string) {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) return '';
  const hours = diff / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hrs`;
}

function shiftCalendarStatus(shift: AssignmentShift): CalendarStatus | null {
  if (isShiftNoResponse(shift)) return 'no_response';
  if (shift.completed || shift.effectiveStatus === 'shift_completed')
    return 'shift_completed';
  if (
    shift.effectiveStatus === 'workers_confirmed' ||
    shift.effectiveStatus === 'shift_cancelled' ||
    shift.effectiveStatus === 'pm_approved'
  )
    return shift.effectiveStatus;
  if (shift.confirmationStatus === 'declined') return 'declined';
  if (shift.confirmationStatus === 'confirmed') return 'confirmed';
  if (shift.confirmationStatus === 'pending' && shift.confirmationRequested)
    return 'action_required';
  return null;
}

function statusMeta(status: CalendarStatus) {
  switch (status) {
    case 'action_required':
      return {
        color: '#EA580C',
        soft: '#FFEDD5',
        text: '#9A3412',
        label: 'Action Required',
        icon: 'alert-circle' as const,
      };
    case 'no_response':
      return {
        color: '#475569',
        soft: '#E2E8F0',
        text: '#334155',
        label: 'No Response',
        icon: 'remove-circle' as const,
      };
    case 'confirmed':
      return {
        color: '#16A34A',
        soft: '#DCFCE7',
        text: '#166534',
        label: 'Confirmed',
        icon: 'checkmark-circle' as const,
      };
    case 'declined':
      return {
        color: '#DC2626',
        soft: '#FEE2E2',
        text: '#991B1B',
        label: 'Declined',
        icon: 'close-circle' as const,
      };
    case 'workers_confirmed':
      return {
        color: '#16A34A',
        soft: '#DCFCE7',
        text: '#166534',
        label: 'Workers Confirmed',
        icon: 'checkmark-circle' as const,
      };
    case 'shift_cancelled':
      return {
        color: '#DC2626',
        soft: '#FEE2E2',
        text: '#991B1B',
        label: 'Shift Cancelled',
        icon: 'close-circle' as const,
      };
    case 'shift_completed':
      return {
        color: '#475569',
        soft: '#E2E8F0',
        text: '#1E293B',
        label: 'Shift Completed',
        icon: 'checkmark-circle' as const,
      };
    case 'pm_approved':
      return {
        color: '#0D9488',
        soft: '#CCFBF1',
        text: '#115E59',
        label: 'PM Approved',
        icon: 'shield-checkmark' as const,
      };
  }
}

function filterMatches(row: ShiftRow, filter: CalendarFilter) {
  if (filter === 'completed')
    return (
      row.status === 'shift_completed' ||
      row.status === 'pm_approved' ||
      row.status === 'no_response'
    );
  const today = localIso(new Date());
  if (filter === 'upcoming')
    return (
      row.status !== 'shift_completed' &&
      row.status !== 'pm_approved' &&
      row.status !== 'no_response' &&
      row.shift.date >= today
    );
  if (filter === 'this_week') {
    const now = new Date();
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay(),
      12,
      0,
      0,
    );
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return (
      row.status !== 'shift_completed' &&
      row.status !== 'pm_approved' &&
      row.status !== 'no_response' &&
      row.shift.date >= localIso(weekStart) &&
      row.shift.date <= localIso(weekEnd)
    );
  }
  return true;
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function CalendarScreen() {
  const { themeColor } = useNativeTheme();
  useShiftResponseClock();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const todayIso = localIso(new Date());
  const scrollRef = useRef<ScrollView>(null);
  const shiftsSectionYRef = useRef(0);
  const [month, setMonth] = useState(
    () =>
      new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12, 0, 0),
  );
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [filter, setFilter] = useState<CalendarFilter>('this_week');
  const [openingAssignmentId, setOpeningAssignmentId] = useState<string | null>(
    null,
  );

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-shift-calendar-assignments', token],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const refetchAssignments = assignmentsQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      setOpeningAssignmentId(null);
      if (token) void refetchAssignments();
    }, [refetchAssignments, token]),
  );

  const allShiftRows = useMemo<ShiftRow[]>(() => {
    const assignments = assignmentsQuery.data ?? [];
    const today = localIso(new Date());
    return assignments
      .flatMap((assignment) =>
        assignment.shifts.map((shift) => ({
          assignment,
          shift,
          status: shiftCalendarStatus(shift),
        })),
      )
      .filter((row) => row.shift.date)
      .sort(
        (a, b) =>
          compareShiftDatesFromToday(a.shift.date, b.shift.date, today) ||
          timeToMinutes(a.shift.startTime) - timeToMinutes(b.shift.startTime),
      );
  }, [assignmentsQuery.data]);

  const visibleRows = useMemo(
    () => allShiftRows.filter((row) => filterMatches(row, filter)),
    [allShiftRows, filter],
  );

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const row of visibleRows) {
      const rows = map.get(row.shift.date) ?? [];
      rows.push(row);
      map.set(row.shift.date, rows);
    }
    return map;
  }, [visibleRows]);

  const selectedRows = shiftsByDate.get(selectedDate) ?? [];
  const calendarDays = buildCalendarDays(month);

  const openShift = (row: ShiftRow) => {
    if (openingAssignmentId) return;
    setOpeningAssignmentId(row.assignment.id);
    router.push({
      pathname: ASSIGNMENT_DETAIL_PATH,
      params: { assignmentId: row.assignment.id, shiftId: row.shift.id },
    });
  };

  const selectCalendarDate = (dateIso: string, hasShifts: boolean) => {
    setSelectedDate(dateIso);
    if (!hasShifts) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, shiftsSectionYRef.current - 12),
        animated: true,
      });
    });
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-[#F8FAFC] dark:bg-slate-900"
    >
      <StatusBar
        style="auto"
        backgroundColor={themeColor('#F8FAFC', 'background')}
        translucent={false}
      />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={
              assignmentsQuery.isRefetching && !assignmentsQuery.isLoading
            }
            onRefresh={() => assignmentsQuery.refetch()}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: tabBarHeight + insets.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[34px] font-extrabold leading-[40px] text-slate-950 dark:text-slate-100">
            Calendar
          </Text>
          <NotificationBell dark={false} />
        </View>

        <View
          className="-mx-4 bg-[#F8FAFC] dark:bg-slate-900 px-4 pb-2 pt-5"
          style={{ zIndex: 10, elevation: 4 }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setFilter(item.id)}
                  className={`rounded-xl border px-5 py-3 ${
                    active
                      ? 'border-[#1c2e4a] bg-[#1c2e4a]'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    className={`text-sm font-extrabold ${active ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View className="mt-6 rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 py-4">
            <Pressable
              onPress={() => setMonth((current) => addMonths(current, -1))}
              className="h-12 w-12 items-center justify-center rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 active:opacity-90"
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={themeColor('#0f172a')}
              />
            </Pressable>
            <Text className="text-2xl font-extrabold text-slate-950 dark:text-slate-100">
              {monthTitle(month)}
            </Text>
            <Pressable
              onPress={() => setMonth((current) => addMonths(current, 1))}
              className="h-12 w-12 items-center justify-center rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 active:opacity-90"
            >
              <Ionicons
                name="chevron-forward"
                size={24}
                color={themeColor('#0f172a')}
              />
            </Pressable>
          </View>

          <View className="flex-row">
            {WEEKDAYS.map((day, index) => (
              <View
                key={day}
                style={{
                  width: getCalendarDayWidth(),
                  borderRightWidth: index === 6 ? 0 : 1,
                }}
                className="items-center border-b border-slate-200 dark:border-slate-700 px-1 py-2"
              >
                <Text className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {assignmentsQuery.isLoading ? (
            <View className="items-center p-8">
              <ActivityIndicator color="#CC0000" />
              <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Loading calendar...
              </Text>
            </View>
          ) : (
            <View>
              {Array.from({ length: 6 }, (_, weekIndex) => (
                <View key={`week-${weekIndex}`} className="flex-row">
                  {calendarDays
                    .slice(weekIndex * 7, weekIndex * 7 + 7)
                    .map((date, dayIndex) => {
                      const dateIso = localIso(date);
                      const rows = shiftsByDate.get(dateIso) ?? [];
                      const isCurrentMonth =
                        date.getMonth() === month.getMonth();
                      const selected = selectedDate === dateIso;
                      const isToday = todayIso === dateIso;
                      return (
                        <Pressable
                          key={dateIso}
                          onPress={() =>
                            selectCalendarDate(dateIso, rows.length > 0)
                          }
                          style={{
                            width: getCalendarDayWidth(),
                            height: 88,
                            borderRightWidth: dayIndex === 6 ? 0 : 1,
                          }}
                          className="items-center border-b border-slate-100 dark:border-slate-700 px-1 py-3 active:bg-slate-50 dark:active:bg-slate-900"
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <View
                            className="h-10 w-10 items-center justify-center rounded-full border-[#CC0000]"
                            style={{
                              backgroundColor: themeColor(
                                selected ? '#CC0000' : 'transparent',
                                'background',
                              ),
                              borderWidth: isToday && !selected ? 1 : 0,
                            }}
                          >
                            <Text
                              className={`text-base font-bold ${
                                selected
                                  ? 'text-white'
                                  : isCurrentMonth
                                    ? 'text-slate-900 dark:text-slate-100'
                                    : 'text-slate-400'
                              }`}
                            >
                              {date.getDate()}
                            </Text>
                          </View>
                          <View className="mt-1 h-[10px] flex-row items-center justify-center gap-1">
                            {rows
                              .filter((row) => row.status !== null)
                              .slice(0, 4)
                              .map((row) => (
                                <View
                                  key={`${row.assignment.id}-${row.shift.id}`}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{
                                    backgroundColor: themeColor(
                                      statusMeta(row.status as CalendarStatus)
                                        .color,
                                      'background',
                                    ),
                                  }}
                                />
                              ))}
                          </View>
                        </Pressable>
                      );
                    })}
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="mt-4 h-1 w-12 self-center rounded-full bg-slate-300 dark:bg-slate-800" />

        <View
          className="mt-5 flex-row items-center justify-between"
          onLayout={(event) => {
            shiftsSectionYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <Text className="text-2xl font-bold text-slate-950 dark:text-slate-100">
            {fullDateLabel(selectedDate)}
          </Text>
          <Text className="text-base font-semibold text-slate-500 dark:text-slate-400">
            {selectedRows.length}{' '}
            {selectedRows.length === 1 ? 'Shift' : 'Shifts'}
          </Text>
        </View>

        <View className="mt-4 gap-4">
          {selectedRows.map((row) => {
            const meta = row.status ? statusMeta(row.status) : null;
            const completedEndTime = row.shift.completedAt
              ? new Date(row.shift.completedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : row.shift.endTime;
            const duration = row.shift.completed
              ? durationLabel(row.shift.startTime, completedEndTime)
              : '';
            const opening = openingAssignmentId === row.assignment.id;
            return (
              <Pressable
                key={`${row.assignment.id}-${row.shift.id}`}
                disabled={Boolean(openingAssignmentId)}
                onPress={() => openShift(row)}
                className="overflow-hidden rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm active:opacity-95 disabled:opacity-70"
                accessibilityRole="button"
              >
                {meta ? (
                  <View
                    className="absolute bottom-0 left-0 top-0 w-1"
                    style={{
                      backgroundColor: themeColor(meta.color, 'background'),
                    }}
                  />
                ) : null}
                <View className="p-4 pl-6">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        {meta ? (
                          <View
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor: themeColor(
                                meta.color,
                                'background',
                              ),
                            }}
                          />
                        ) : null}
                        <Text className="text-xl font-extrabold text-slate-950 dark:text-slate-100">
                          {row.shift.shiftName || ''}
                        </Text>
                      </View>
                      <Text className="mt-2 text-base text-slate-700 dark:text-slate-200">
                        {row.shift.completed
                          ? `${row.shift.startTime} - ${completedEndTime}${duration ? `  (${duration})` : ''}`
                          : row.shift.startTime}
                      </Text>
                    </View>
                    {meta ? (
                      <View
                        className="flex-row items-center gap-1 rounded-full px-3 py-1"
                        style={{
                          backgroundColor: themeColor(meta.soft, 'background'),
                        }}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={13}
                          color={themeColor(meta.text)}
                        />
                        <Text
                          className="text-[11px] font-extrabold uppercase"
                          style={{ color: themeColor(meta.text, 'text') }}
                        >
                          {meta.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="mt-4 flex-row gap-2">
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={themeColor('#1c2e4a')}
                    />
                    <View className="flex-1">
                      <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {row.assignment.projectName || row.assignment.title}
                      </Text>
                    </View>
                    {opening ? (
                      <ActivityIndicator color="#CC0000" />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={22}
                        color={themeColor('#64748b')}
                      />
                    )}
                  </View>

                  <View className="mt-3 flex-row items-start gap-2">
                    <Ionicons
                      name="location-outline"
                      size={19}
                      color={themeColor('#DC2626')}
                    />
                    <Text className="flex-1 text-sm leading-5 text-slate-600 dark:text-slate-200">
                      {row.assignment.location || 'No address available'}
                    </Text>
                  </View>

                  <View className="mt-3 flex-row items-center gap-2">
                    <Ionicons
                      name="construct-outline"
                      size={17}
                      color={themeColor('#475569')}
                    />
                    <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      My Role: {row.shift.roleName || 'Not assigned'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {!assignmentsQuery.isLoading && selectedRows.length === 0 ? (
            <View className="items-center rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
              <Ionicons name="calendar-outline" size={30} color="#94a3b8" />
              <Text className="mt-2 text-base font-bold text-slate-800 dark:text-slate-100">
                No shifts this day
              </Text>
              <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
                Your worker shifts will appear here when assigned.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

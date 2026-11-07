import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  type AssignmentListItem,
} from '@/lib/assignments-service';

type CrewMember = NonNullable<
  NonNullable<AssignmentListItem['quickAccess']>['crew']
>[number];

function assignmentSubtitle(assignment?: AssignmentListItem) {
  if (!assignment) return '';
  return [assignment.title, assignment.location].filter(Boolean).join(' - ');
}

function formatShiftDate(date?: string) {
  if (!date) return '';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function CrewMemberRow({
  member,
  shiftId,
}: {
  member: CrewMember;
  shiftId?: string;
}) {
  const shiftRoles = shiftId ? member.shiftRoles?.[shiftId] : undefined;
  const roleLine = shiftRoles?.length
    ? shiftRoles.join(', ')
    : member.roleLine || 'Assigned crew';
  const badge = shiftRoles?.[0] || member.badge || 'Crew';

  return (
    <View className="mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3 border-[#dce4f0] dark:border-[#334155]">
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-[#CC0000]">
          <Text className="text-sm font-bold text-white">
            {member.initials || '?'}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-[#1c2e4a] dark:text-[#f1f5f9]">
                {member.name}
              </Text>
              <Text className="mt-0.5 text-[13px] text-[#74819a] dark:text-[#94a3b8]">
                {roleLine}
              </Text>
            </View>
            <View className="rounded-full bg-slate-100 dark:bg-slate-900 px-2.5 py-1">
              <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
                {badge}
              </Text>
            </View>
          </View>
          {member.phone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${member.phone}`)}
              className="mt-2 self-start rounded-xl border border-[#CC0000] bg-white dark:bg-slate-800 px-3 py-1.5 active:opacity-80"
            >
              <Text className="text-xs font-bold text-[#CC0000] dark:text-red-400">
                Call
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function CrewScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { assignmentId, shiftId, shiftDate } = useLocalSearchParams<{
    assignmentId?: string;
    shiftId?: string;
    shiftDate?: string;
  }>();
  const assignmentsQuery = useQuery({
    queryKey: ['mobile-assignments-quick-crew', token, assignmentId, shiftId],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const assignment = assignmentsQuery.data?.find(
    (item) => item.id === assignmentId,
  );
  const visibleMembers = useMemo(() => {
    const members = assignment?.quickAccess?.crew ?? [];
    const normalizedShiftId = typeof shiftId === 'string' ? shiftId : '';
    if (!normalizedShiftId) return members;
    const hasShiftScopedCrew = members.some((member) =>
      Array.isArray(member.shiftIds),
    );
    if (!hasShiftScopedCrew) return members;
    return members.filter((member) =>
      member.shiftIds?.includes(normalizedShiftId),
    );
  }, [assignment?.quickAccess?.crew, shiftId]);
  const shiftDateLabel = formatShiftDate(
    typeof shiftDate === 'string' ? shiftDate : undefined,
  );

  return (
    <View className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]">
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader title="Crew" subtitle={assignment?.title} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View
          className="mb-3 rounded-[20px] bg-white dark:bg-slate-800 p-4 border-[#dce4f0] dark:border-[#334155]"
          style={{ borderWidth: 1 }}
        >
          <Text className="text-lg font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
            {assignment?.orderNumber
              ? `#${assignment.orderNumber.replace(/^#/, '')}`
              : 'Assignment'}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-[#74819a] dark:text-[#94a3b8]">
            {assignmentSubtitle(assignment)}
          </Text>
        </View>

        <View
          className="rounded-[20px] bg-white dark:bg-slate-800 p-4 border-[#dce4f0] dark:border-[#334155]"
          style={{ borderWidth: 1 }}
        >
          <Text className="text-lg font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
            Assigned Crew
          </Text>
          <Text className="mb-3 mt-0.5 text-xs text-[#74819a] dark:text-[#94a3b8]">
            {shiftDateLabel
              ? `Shift crew - ${shiftDateLabel}`
              : 'Read-only list'}
          </Text>

          {assignmentsQuery.isLoading ? (
            <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Loading crew...
            </Text>
          ) : visibleMembers.length > 0 ? (
            visibleMembers.map((member) => (
              <CrewMemberRow
                key={`${typeof shiftId === 'string' ? shiftId : 'assignment'}-${member.id}`}
                member={member}
                shiftId={typeof shiftId === 'string' ? shiftId : undefined}
              />
            ))
          ) : (
            <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              No crew assigned to this shift.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

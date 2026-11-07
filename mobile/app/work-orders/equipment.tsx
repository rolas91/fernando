import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  type AssignmentListItem,
} from '@/lib/assignments-service';

type EquipmentItem = NonNullable<
  NonNullable<AssignmentListItem['quickAccess']>['equipment']
>[number];

function statusBadgeStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('maintenance') || normalized.includes('retired'))
    return { bg: '#fee2e2', text: '#dc2626' };
  if (normalized.includes('use')) return { bg: '#ffedd5', text: '#c2410c' };
  return { bg: '#dcfce7', text: '#15803d' };
}

function EquipmentCard({ item }: { item: EquipmentItem }) {
  const { themeColor } = useNativeTheme();
  const badge = statusBadgeStyle(item.status || 'Assigned');
  const icon = item.kind === 'material' ? 'cube-outline' : 'car-outline';
  return (
    <View
      className="mb-3 rounded-2xl bg-white dark:bg-slate-800 p-3 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-xl bg-[#1c2e4a]">
          <Ionicons name={icon} size={22} color="#fff" />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-base font-bold text-[#1c2e4a] dark:text-[#f1f5f9]">
              {item.name}
            </Text>
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: themeColor(badge.bg, 'background') }}
            >
              <Text
                className="text-[11px] font-bold"
                style={{ color: themeColor(badge.text, 'text') }}
              >
                {item.status || 'Assigned'}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-[13px] leading-5 text-[#74819a] dark:text-[#94a3b8]">
            {item.description}
          </Text>
          <View className="mt-2.5 flex-row flex-wrap gap-2">
            {[
              item.type,
              item.sku ? `SKU: ${item.sku}` : '',
              item.identifier ? `Ref: ${item.identifier}` : '',
              item.kind,
            ]
              .filter(Boolean)
              .map((pill) => (
                <View
                  key={pill}
                  className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1"
                >
                  <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
                    {pill}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AssignedEquipmentScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { assignmentId, shiftId } = useLocalSearchParams<{
    assignmentId?: string;
    shiftId?: string;
  }>();
  const assignmentsQuery = useQuery({
    queryKey: ['mobile-assignments-quick-equipment', token],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const assignment = assignmentsQuery.data?.find(
    (item) => item.id === assignmentId,
  );
  const allEquipment = assignment?.quickAccess?.equipment ?? [];
  const hasShiftScopedEquipment = allEquipment.some((item) =>
    Array.isArray(item.shiftIds),
  );
  const equipment =
    shiftId && hasShiftScopedEquipment
      ? allEquipment.filter((item) => item.shiftIds?.includes(shiftId))
      : allEquipment;

  return (
    <View className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]">
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader title="Assigned Equipment" subtitle={assignment?.title} />

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
            {[assignment?.title, assignment?.location]
              .filter(Boolean)
              .join(' - ')}
          </Text>
        </View>

        <View
          className="rounded-[20px] bg-white dark:bg-slate-800 p-4 border-[#dce4f0] dark:border-[#334155]"
          style={{ borderWidth: 1 }}
        >
          <Text className="text-lg font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
            Assigned Equipment & Materials
          </Text>
          <Text className="mb-3 mt-0.5 text-xs text-[#74819a] dark:text-[#94a3b8]">
            Read-only list
          </Text>

          {assignmentsQuery.isLoading ? (
            <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Loading equipment...
            </Text>
          ) : equipment.length > 0 ? (
            equipment.map((item) => (
              <EquipmentCard key={`${item.kind}-${item.id}`} item={item} />
            ))
          ) : (
            <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              No equipment or materials assigned.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

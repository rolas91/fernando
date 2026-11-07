import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader, NAVY } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import { fetchAssignments } from '@/lib/assignments-service';

function DetailRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const { themeColor } = useNativeTheme();
  if (!value?.trim()) return null;
  const content = (
    <View
      className="mb-3 flex-row items-start gap-3 rounded-2xl bg-white dark:bg-slate-800 p-3 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">
        <Ionicons name={icon} size={20} color={themeColor(NAVY)} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[11px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
          {label}
        </Text>
        <Text className="mt-1 text-[14px] font-semibold text-[#1c2e4a] dark:text-[#f1f5f9]">
          {value}
        </Text>
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} className="active:opacity-85">
      {content}
    </Pressable>
  ) : (
    content
  );
}

export default function ClientScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { assignmentId } = useLocalSearchParams<{ assignmentId?: string }>();
  const assignmentsQuery = useQuery({
    queryKey: ['mobile-assignments-quick-client', token],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const assignment = assignmentsQuery.data?.find(
    (item) => item.id === assignmentId,
  );
  const client = assignment?.quickAccess?.client;

  return (
    <View className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]">
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader title="Client" subtitle={assignment?.title} />

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
            {client?.name || 'Client'}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-[#74819a] dark:text-[#94a3b8]">
            {[assignment?.title, assignment?.location]
              .filter(Boolean)
              .join(' - ')}
          </Text>
        </View>

        {assignmentsQuery.isLoading ? (
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Loading client...
          </Text>
        ) : client ? (
          <>
            <DetailRow
              icon="location-outline"
              label="Address"
              value={client.address}
            />
            <DetailRow
              icon="briefcase-outline"
              label="Project #"
              value={client.projectNumber}
            />
            <DetailRow
              icon="person-circle-outline"
              label="Project Manager"
              value={client.projectManager}
            />
            <DetailRow
              icon="mail-open-outline"
              label="Project Manager Email"
              value={client.projectManagerEmail}
              onPress={
                client.projectManagerEmail
                  ? () =>
                      void Linking.openURL(
                        `mailto:${client.projectManagerEmail}`,
                      )
                  : undefined
              }
            />
          </>
        ) : (
          <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            No client data available for this assignment.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

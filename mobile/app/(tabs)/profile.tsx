import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
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
import { NotificationBell } from '@/components/notification-bell';
import { ThemeSelector } from '@/components/theme-selector';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchMyWorkerProfile,
  type MobileWorkerProfile,
} from '@/lib/worker-profile-service';

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { themeColor } = useNativeTheme();
  return (
    <View className="flex-row items-start gap-3 border-b border-slate-100 dark:border-slate-700 py-3 last:border-b-0">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900">
        <Ionicons name={icon} size={18} color={themeColor('#475569')} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </Text>
        <Text className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          {value || 'Not provided'}
        </Text>
      </View>
    </View>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <View className="flex-row items-center gap-2 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
        <Ionicons name={icon} size={18} color="#CC0000" />
        <Text className="text-base font-bold text-slate-800 dark:text-slate-100">
          {title}
        </Text>
      </View>
      <View className="px-4 py-1">{children}</View>
    </View>
  );
}

function profileAddress(profile: MobileWorkerProfile) {
  return [
    profile.primaryAddress,
    profile.city,
    profile.state,
    profile.zipCode,
    profile.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

function certificationExpiration(expirationDate?: string) {
  if (!expirationDate) return { label: 'No expiration date', expired: false };
  const normalized = expirationDate.slice(0, 10);
  const expired = normalized < new Date().toISOString().slice(0, 10);
  const parsed = new Date(`${normalized}T12:00:00`);
  return {
    label: `${expired ? 'Expired' : 'Expires'} ${Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleDateString('en-US')}`,
    expired,
  };
}

export default function ProfileScreen() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileQuery = useQuery({
    queryKey: ['mobile-worker-profile', token],
    enabled: Boolean(token),
    queryFn: () => fetchMyWorkerProfile(token as string),
  });
  const profile = profileQuery.data;
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : (user?.name ?? 'DR User');
  const operationalRoles =
    profile?.workerRoles?.map((role) => role.name).filter(Boolean) ?? [];
  const fallbackRole = profile?.role || profile?.type || '';

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView
      edges={['left', 'right']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <View
        className="rounded-b-[28px] bg-[#1c2e4a] px-5 pb-6"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-xs text-slate-100">Account</Text>
            <Text className="text-[34px] font-bold leading-[40px] text-white">
              Profile
            </Text>
          </View>
          <NotificationBell />
        </View>
        <Text className="mt-1 text-sm text-slate-100">
          Review your account and worker details.
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching}
            onRefresh={() => void profileQuery.refetch()}
          />
        }
      >
        <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-xl bg-red-100 dark:bg-[#450a0a]">
              <Ionicons name="person" size={28} color="#CC0000" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                {displayName}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400">
                {profile?.email || user?.email || 'user@drtraffic.com'}
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                <Text className="rounded-full bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-200">
                  App access: {user?.role ?? 'viewer'}
                </Text>
                {profile?.status ? (
                  <Text className="rounded-full bg-emerald-100 dark:bg-[#022c22] px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:text-[#6ee7b7]">
                    {profile.status}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <ThemeSelector />

        {profileQuery.isLoading ? (
          <View className="mb-4 items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-10">
            <ActivityIndicator color="#CC0000" />
            <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Loading worker details...
            </Text>
          </View>
        ) : profileQuery.isError ? (
          <View className="mb-4 rounded-2xl border border-amber-200 dark:border-[#92400e] bg-amber-50 dark:bg-[#451a03] p-4">
            <Text className="font-semibold text-amber-900 dark:text-[#fcd34d]">
              Worker profile unavailable
            </Text>
            <Text className="mt-1 text-sm text-amber-800 dark:text-[#fcd34d]">
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : 'The account is not linked to a worker profile.'}
            </Text>
            <Pressable
              onPress={() => void profileQuery.refetch()}
              className="mt-3 self-start rounded-lg bg-amber-100 dark:bg-[#451a03] px-3 py-2"
            >
              <Text className="text-sm font-semibold text-amber-900 dark:text-[#fcd34d]">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : profile ? (
          <>
            <Section icon="briefcase-outline" title="Work Profile">
              <DetailRow
                icon="id-card-outline"
                label="Primary role"
                value={fallbackRole}
              />
              <DetailRow
                icon="call-outline"
                label="Phone"
                value={profile.phone}
              />
              <DetailRow
                icon="location-outline"
                label="Address"
                value={profileAddress(profile)}
              />
            </Section>

            <Section icon="people-outline" title="Worker Roles">
              <View className="flex-row flex-wrap gap-2 py-3">
                {(operationalRoles.length > 0
                  ? operationalRoles
                  : fallbackRole
                    ? [fallbackRole]
                    : []
                ).map((role) => (
                  <Text
                    key={role}
                    className="rounded-full bg-blue-50 dark:bg-[#172554] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-[#93c5fd]"
                  >
                    {role}
                  </Text>
                ))}
                {operationalRoles.length === 0 && !fallbackRole ? (
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    No worker roles assigned.
                  </Text>
                ) : null}
              </View>
            </Section>

            <Section icon="ribbon-outline" title="Certifications">
              {profile.certifications.length > 0 ? (
                profile.certifications.map((certification) => {
                  const expiration = certificationExpiration(
                    certification.expirationDate,
                  );
                  return (
                    <View
                      key={certification.id}
                      className="border-b border-slate-100 dark:border-slate-700 py-3 last:border-b-0"
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {certification.name}
                          </Text>
                          {certification.description ? (
                            <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {certification.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            expiration.expired
                              ? 'bg-red-100 dark:bg-[#450a0a] text-red-700 dark:text-[#fca5a5]'
                              : 'bg-emerald-100 dark:bg-[#022c22] text-emerald-700 dark:text-[#6ee7b7]'
                          }`}
                        >
                          {expiration.label}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text className="py-3 text-sm text-slate-500 dark:text-slate-400">
                  No certifications assigned.
                </Text>
              )}
            </Section>

            <Section icon="construct-outline" title="Skills">
              <View className="flex-row flex-wrap gap-2 py-3">
                {profile.skills.length > 0 ? (
                  profile.skills.map((skill) => (
                    <Text
                      key={skill.id}
                      className="rounded-full bg-purple-50 dark:bg-[#3b0764] px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-[#d8b4fe]"
                    >
                      {skill.name}
                    </Text>
                  ))
                ) : (
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    No skills assigned.
                  </Text>
                )}
              </View>
            </Section>
          </>
        ) : null}

        <Pressable
          onPress={handleLogout}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5"
        >
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text className="text-base font-semibold text-white">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

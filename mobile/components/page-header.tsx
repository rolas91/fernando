import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';

export const NAVY = '#1c2e4a';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  back?: () => void;
  showBack?: boolean;
  showNotification?: boolean;
  rightSlot?: React.ReactNode;
};

/**
 * Shared header used across all sub-screens (chat, documents, client, etc.).
 * Matches the navy header used on Assignments / Assignment Detail.
 *
 * @param showBack Defaults to true. Pass false for tab screens or modal screens
 *                  where a back chevron would be misleading.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  showBack = true,
  showNotification = true,
  rightSlot,
}: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const handleBack = back ?? (() => router.back());

  return (
    <View
      className="bg-[#1c2e4a] px-5 pb-5 rounded-b-[28px] overflow-hidden"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="absolute -right-14 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <View className="flex-row items-center gap-3">
        {showBack ? (
          <Pressable
            onPress={handleBack}
            className="h-10 w-10 items-center justify-center rounded-xl bg-white/15 active:opacity-90"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-lg font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-slate-100" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightSlot ?? (showNotification ? <NotificationBell /> : null)}
      </View>
    </View>
  );
}

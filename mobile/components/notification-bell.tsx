import { CancellationConfirmButton } from '@/components/cancellation-confirm-button';
import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/auth-context';
import {
  deleteMobileNotification,
  fetchMobileNotifications,
  markMobileNotificationRead,
  type MobileNotification,
} from '@/lib/notifications-service';
import { shiftChatHref, shiftDetailHref } from '@/lib/notification-deep-link';

function notificationDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function workOrderIdFor(notification: MobileNotification) {
  if (notification.workOrderId) return notification.workOrderId;
  const match = notification.link?.match(
    /(?:work-orders\/|assignmentId=)([^/?&]+)/i,
  );
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function NotificationBell({ dark = true }: { dark?: boolean }) {
  const { themeColor } = useNativeTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ['mobile-notifications', token] as const;
  const notificationsQuery = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => fetchMobileNotifications(token as string),
  });
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  useEffect(() => {
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => undefined);
  }, [unreadCount]);

  const readMutation = useMutation({
    mutationFn: (notificationId: string) =>
      markMobileNotificationRead(token as string, notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MobileNotification[]>(queryKey);
      const next = (previous ?? []).map((item) =>
        item.id === notificationId ? { ...item, read: true } : item,
      );
      queryClient.setQueryData<MobileNotification[]>(queryKey, next);
      void Notifications.setBadgeCountAsync(
        next.filter((item) => !item.read).length,
      ).catch(() => undefined);
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (notificationId: string) =>
      deleteMobileNotification(token as string, notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MobileNotification[]>(queryKey);
      const next = (previous ?? []).filter(
        (item) => item.id !== notificationId,
      );
      queryClient.setQueryData<MobileNotification[]>(queryKey, next);
      void Notifications.setBadgeCountAsync(
        next.filter((item) => !item.read).length,
      ).catch(() => undefined);
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const openNotification = (notification: MobileNotification) => {
    if (!notification.read) readMutation.mutate(notification.id);
    const assignmentId = workOrderIdFor(notification);
    setOpen(false);
    if (!assignmentId) return;
    if (notification.type === 'shift_chat_message' && notification.shiftId) {
      router.push(
        shiftChatHref({
          assignmentId,
          shiftId: notification.shiftId,
          title: notification.title || 'Shift Chat',
        }),
      );
      return;
    }
    router.push(
      shiftDetailHref({
        assignmentId,
        shiftId: notification.shiftId,
        notificationId: notification.id,
      }),
    );
  };

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true);
          void notificationsQuery.refetch();
        }}
        className={`h-10 w-10 items-center justify-center rounded-xl ${dark ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-900'}`}
        accessibilityRole="button"
        accessibilityLabel={`${unreadCount} unread notifications`}
      >
        <Ionicons
          name="notifications"
          size={21}
          color={themeColor(dark ? '#FACC15' : '#1c2e4a')}
        />
        {unreadCount > 0 ? (
          <View className="absolute -right-1 -top-1 min-w-[18px] items-center rounded-full bg-red-600 px-1 py-0.5">
            <Text className="text-[9px] font-extrabold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          className="flex-1 items-center justify-center bg-slate-950/50 px-4"
          style={{
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View className="max-h-[78%] w-full rounded-xl bg-white dark:bg-slate-800 p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  Shift Notifications
                </Text>
                <Text className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {unreadCount} unread
                </Text>
              </View>
              <Pressable
                onPress={() => setOpen(false)}
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
                <View className="items-center p-6">
                  <ActivityIndicator color="#CC0000" />
                </View>
              ) : null}
              {!notificationsQuery.isLoading && notifications.length === 0 ? (
                <View className="items-center rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <Ionicons
                    name="notifications-outline"
                    size={28}
                    color="#94a3b8"
                  />
                  <Text className="mt-2 font-bold text-slate-800 dark:text-slate-100">
                    No shift notifications
                  </Text>
                </View>
              ) : null}
              {notifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  onPress={() => openNotification(notification)}
                  className={`rounded-xl border p-3 ${notification.read ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800' : 'border-red-100 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a]'}`}
                >
                  <View className="flex-row items-start gap-3">
                    <View
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${notification.read ? 'bg-slate-300 dark:bg-slate-800' : 'bg-red-600'}`}
                    />
                    <View className="flex-1">
                      <View className="flex-row items-start justify-between gap-2">
                        <Text
                          className="flex-1 text-sm font-extrabold text-slate-900 dark:text-slate-100"
                          numberOfLines={1}
                        >
                          {notification.title || 'Shift update'}
                        </Text>
                        <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {notificationDate(
                            notification.timestamp || notification.createdAt,
                          )}
                        </Text>
                      </View>
                      <Text
                        className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-200"
                        numberOfLines={3}
                      >
                        {notification.message}
                      </Text>
                      {notification.shiftId ? (
                        <Text className="mt-2 text-[11px] font-extrabold uppercase text-violet-700 dark:text-[#c4b5fd]">
                          {notification.type === 'shift_chat_message'
                            ? 'Open conversation'
                            : 'Open shift details'}
                        </Text>
                      ) : null}
                    </View>
                    <CancellationConfirmButton notification={notification} />
                    <Pressable
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        deleteMutation.mutate(notification.id);
                      }}
                      className="h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color={themeColor('#DC2626')}
                      />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

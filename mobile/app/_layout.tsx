import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { AppearanceProvider } from '@/contexts/appearance-context';
import { notificationDeepLink } from '@/lib/notification-deep-link';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function PushNotificationQuerySync() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useAuth();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);
  const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refreshMobileNotificationData = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['mobile-notifications'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['mobile-notification-assignments'],
    });
    void queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] });
    void queryClient.invalidateQueries({
      queryKey: ['mobile-assignment-detail'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['mobile-shift-chat-unread'],
    });
  }, [queryClient]);

  const refreshAfterPushPersistence = useCallback(() => {
    refreshMobileNotificationData();
    refreshTimers.current.push(
      setTimeout(refreshMobileNotificationData, 1500),
      setTimeout(refreshMobileNotificationData, 5000),
    );
  }, [refreshMobileNotificationData]);

  useEffect(() => {
    return () => {
      refreshTimers.current.forEach(clearTimeout);
      refreshTimers.current = [];
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const notificationSubscription =
      Notifications.addNotificationReceivedListener(() => {
        refreshAfterPushPersistence();
      });
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') refreshAfterPushPersistence();
      },
    );

    return () => {
      notificationSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refreshAfterPushPersistence]);

  // Tapping a push opens the shift detail through the same deep link used by
  // the in-app list. useLastNotificationResponse also covers the cold start,
  // where the response listener is never called.
  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      isLoading ||
      !isAuthenticated ||
      !lastNotificationResponse
    )
      return;

    const responseId = lastNotificationResponse.notification.request.identifier;
    if (handledResponseId.current === responseId) return;
    handledResponseId.current = responseId;

    const target = notificationDeepLink(
      lastNotificationResponse.notification.request.content.data,
    );

    // Let the root redirect (login / tabs) settle before pushing the detail.
    const timer = setTimeout(() => {
      refreshMobileNotificationData();
      if (!target) return;
      router.push(target);
      void Notifications.clearLastNotificationResponseAsync().catch(
        () => undefined,
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [
    isAuthenticated,
    isLoading,
    lastNotificationResponse,
    refreshMobileNotificationData,
  ]);

  return null;
}

export default function RootLayout() {
  return (
    <AppearanceProvider>
      <RootNavigator />
    </AppearanceProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushNotificationQuerySync />
        <ThemeProvider
          value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen
              name="forgot-password"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="reset-password"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="work-orders"
              options={{
                headerShown: false,

                presentation: 'fullScreenModal',
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="modal"
              options={{ presentation: 'modal', title: 'Modal' }}
            />
          </Stack>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

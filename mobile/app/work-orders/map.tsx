import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Text,
  Pressable,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';
import { useColorScheme } from '@/hooks/use-color-scheme';

function coordinate(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ShiftMapScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { latitude, longitude, location, title } = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    location?: string;
    title?: string;
  }>();
  const lat = coordinate(latitude);
  const lng = coordinate(longitude);
  const [resolvedCoordinates, setResolvedCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(
    lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null,
  );
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  useEffect(() => {
    if (resolvedCoordinates || !location?.trim()) return;
    let active = true;
    setIsResolvingAddress(true);
    setGeocodeFailed(false);

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted)
          throw new Error('Location permission was not granted.');
        const matches = await Location.geocodeAsync(location.trim());
        const first = matches[0];
        if (
          !first ||
          !Number.isFinite(first.latitude) ||
          !Number.isFinite(first.longitude)
        ) {
          throw new Error('Address could not be geocoded.');
        }
        if (active)
          setResolvedCoordinates({
            latitude: first.latitude,
            longitude: first.longitude,
          });
      } catch {
        if (active) setGeocodeFailed(true);
      } finally {
        if (active) setIsResolvingAddress(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [location, resolvedCoordinates]);

  const hasCoordinates = resolvedCoordinates !== null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <View
        className="bg-[#1c2e4a] px-5 pb-6 rounded-b-[28px] overflow-hidden"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="absolute -right-14 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="h-9 w-9 items-center justify-center rounded-xl bg-white/15"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </Pressable>
            <View>
              <Text className="text-base font-semibold text-white">
                DR Traffic Control
              </Text>
              <Text className="text-[11px] text-slate-100">
                Operations Management Platform
              </Text>
            </View>
          </View>
          <NotificationBell />
        </View>
        <Text className="mt-4 text-[30px] font-bold text-white">
          Shift Location
        </Text>
      </View>

      <View className="-mt-5 flex-1 px-4 pb-4">
        <View className="flex-1 overflow-hidden rounded-[22px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {hasCoordinates ? (
            <MapView
              style={{ flex: 1 }}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              mapType="standard"
              userInterfaceStyle={colorScheme === 'dark' ? 'dark' : 'light'}
              initialRegion={{
                latitude: resolvedCoordinates.latitude,
                longitude: resolvedCoordinates.longitude,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              }}
            >
              <Marker
                coordinate={resolvedCoordinates}
                title={title || 'Shift location'}
                description={location || undefined}
                pinColor="#CC0000"
              >
                <View className="items-center">
                  <View className="h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[#CC0000] shadow-lg">
                    <Ionicons name="location" size={24} color="#fff" />
                  </View>
                  <View className="-mt-1 h-3 w-3 rotate-45 border-b-[2px] border-r-[2px] border-white bg-[#CC0000]" />
                </View>
              </Marker>
            </MapView>
          ) : isResolvingAddress ? (
            <View className="flex-1 items-center justify-center px-8">
              <ActivityIndicator size="large" color="#CC0000" />
              <Text className="mt-4 text-center text-lg font-extrabold text-slate-800 dark:text-slate-100">
                Loading shift location...
              </Text>
              <Text className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                Converting the assignment address into map coordinates.
              </Text>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons name="location-outline" size={48} color="#94a3b8" />
              <Text className="mt-4 text-center text-lg font-extrabold text-slate-800 dark:text-slate-100">
                Coordinates unavailable
              </Text>
              <Text className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                {geocodeFailed
                  ? 'The API did not provide coordinates and the address could not be resolved.'
                  : 'This shift does not have latitude, longitude or an address configured yet.'}
              </Text>
            </View>
          )}
          <View className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <Text className="text-base font-extrabold text-[#071535] dark:text-slate-100">
              {title || 'Shift location'}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-200">
              {location || 'No address available'}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

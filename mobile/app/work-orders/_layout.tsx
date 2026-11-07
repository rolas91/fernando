import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function WorkOrdersStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation:
          Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="map" />
      <Stack.Screen
        name="form"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="signature-queue"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="incident-report"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="crew"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="equipment"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="job-documents"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="chat"
        options={{
          animation:
            Platform.OS === 'android' ? 'simple_push' : 'slide_from_right',
        }}
      />
    </Stack>
  );
}

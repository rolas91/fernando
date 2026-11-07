import { useAuth } from '@/contexts/auth-context';
import {
  acknowledgeShiftCancellation,
  type MobileNotification,
} from '@/lib/notifications-service';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

export function CancellationConfirmButton({
  notification,
}: {
  notification: MobileNotification;
}) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      acknowledgeShiftCancellation(token as string, notification.id),
    onSuccess: async (saved) => {
      queryClient.setQueryData<MobileNotification[]>(
        ['mobile-notifications', token],
        (items) => items?.map((item) => (item.id === saved.id ? saved : item)),
      );
      await Promise.all(
        [
          'mobile-notifications',
          'mobile-assignments',
          'mobile-shift-calendar-assignments',
          'mobile-notification-assignments',
          'mobile-assignment-detail',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    },
    onError: (error) =>
      Alert.alert('Unable to confirm cancellation', error.message),
  });
  if (notification.type !== 'shift_cancelled') return null;
  const confirmed = Boolean(notification.acknowledgedAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        confirmed
          ? 'Cancellation confirmed'
          : 'Confirm shift cancellation received'
      }
      disabled={confirmed || mutation.isPending || !token}
      onPress={(event) => {
        event.stopPropagation();
        mutation.mutate();
      }}
      className="flex-row items-center gap-1 rounded-lg bg-red-50 px-2 py-2 dark:bg-red-950"
    >
      {mutation.isPending ? (
        <ActivityIndicator size="small" color="#DC2626" />
      ) : (
        <Ionicons
          name={confirmed ? 'ban-outline' : 'checkmark-circle-outline'}
          size={18}
          color="#DC2626"
        />
      )}
      <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
        {confirmed ? 'Confirmed' : 'Confirm'}
      </Text>
    </Pressable>
  );
}

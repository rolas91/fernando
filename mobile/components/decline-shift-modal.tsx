import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

type DeclineShiftModalProps = {
  visible: boolean;
  pending?: boolean;
  onKeep: () => void;
  onDecline: () => void;
};

export function DeclineShiftModal({
  visible,
  pending = false,
  onKeep,
  onDecline,
}: DeclineShiftModalProps) {
  const { themeColor } = useNativeTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!pending) onKeep();
      }}
    >
      <View className="flex-1 items-center justify-center bg-slate-950/65 px-6">
        <View className="w-full max-w-[360px] rounded-[20px] bg-white dark:bg-slate-800 px-5 pb-5 pt-4 shadow-2xl">
          <View className="items-end">
            <Pressable
              disabled={pending}
              onPress={onKeep}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-900 disabled:opacity-40"
              accessibilityRole="button"
              accessibilityLabel="Close decline confirmation"
            >
              <Ionicons name="close" size={24} color={themeColor('#0F172A')} />
            </Pressable>
          </View>

          <View className="-mt-3 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-[#450a0a]">
              <Text className="text-[34px] font-medium text-red-600 dark:text-[#fca5a5]">
                !
              </Text>
            </View>
            <Text className="mt-4 text-center text-[22px] font-extrabold text-[#071535] dark:text-slate-100">
              Decline this shift?
            </Text>
            <Text className="mt-3 px-3 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
              Are you sure you want to decline this shift?{`\n`}You will be
              removed from the assignment.
            </Text>
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              disabled={pending}
              onPress={onKeep}
              className="flex-1 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-3.5 active:bg-slate-50 dark:active:bg-slate-900 disabled:opacity-50"
              accessibilityRole="button"
            >
              <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                Keep Shift
              </Text>
            </Pressable>
            <Pressable
              disabled={pending}
              onPress={onDecline}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 active:bg-red-700 disabled:opacity-60"
              accessibilityRole="button"
            >
              {pending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : null}
              <Text className="text-sm font-extrabold text-white">
                {pending ? 'Declining...' : 'Decline Shift'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

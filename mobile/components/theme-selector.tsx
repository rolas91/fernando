import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import {
  useAppearance,
  type ThemePreference,
} from '@/contexts/appearance-context';
import { useNativeTheme } from '@/hooks/use-native-theme';

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'system',
    label: 'System default',
    description: 'Match your device settings automatically.',
    icon: 'phone-portrait-outline',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light theme.',
    icon: 'sunny-outline',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark theme.',
    icon: 'moon-outline',
  },
];

export function ThemeSelector() {
  const { preference, setPreference, saving, error } = useAppearance();
  const { themeColor } = useNativeTheme();

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="text-base font-bold text-slate-800 dark:text-slate-100">
        Appearance
      </Text>
      <Text className="mb-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
        Choose how the app looks on this device.
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="App theme"
        className="gap-2"
      >
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={saving}
              onPress={() => void setPreference(option.value)}
              className={`min-h-16 flex-row items-center gap-3 rounded-xl border px-3 py-3 ${
                selected
                  ? 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-950'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <Ionicons
                name={option.icon}
                size={22}
                color={themeColor(selected ? '#CC0000' : '#475569')}
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {option.label}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {option.description}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={themeColor(selected ? '#CC0000' : '#64748b')}
              />
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

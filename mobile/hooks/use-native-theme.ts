import { useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import palette from '@/constants/theme-colors.json';

type ColorRole = keyof typeof palette;

// Native controls (icons, navigation and charts) accept colors rather than className.
// Keep their colors aligned with the Tailwind dark variants used by the screens.
export function useNativeTheme() {
  const isDark = useColorScheme() === 'dark';
  const themeColor = useCallback(
    (color: string, role: ColorRole = 'text'): string => {
      if (!isDark) return color;
      const colors: Record<string, string> = palette[role];
      return colors[color.toLowerCase()] ?? color;
    },
    [isDark],
  );
  return { isDark, themeColor };
}

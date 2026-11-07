import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'dr-workops:theme-preference';

type AppearanceContextValue = {
  preference: ThemePreference;
  saving: boolean;
  error: string | null;
  setPreference: (value: ThemePreference) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useNativeWindColorScheme();
  const systemScheme = useSystemColorScheme() ?? 'light';
  const applyScheme = useRef(setColorScheme);
  applyScheme.current = setColorScheme;
  const [preference, updatePreference] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          updatePreference(stored);
        }
      })
      .catch(() => {
        if (active)
          setError('Could not load your theme. System default is active.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    // On native, "system" releases the OS appearance override (including pickers).
    // On web, apply the resolved system color to Tailwind's root dark class.
    applyScheme.current(
      Platform.OS === 'web' && preference === 'system'
        ? systemScheme
        : preference,
    );
  }, [preference, ready, systemScheme]);

  const setPreference = async (value: ThemePreference) => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setError(null);
    updatePreference(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, value);
    } catch {
      setError(
        'Theme changed, but could not be saved. Select it again to retry.',
      );
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  };

  // Restore the saved preference before mounting the app's screens.
  if (!ready) return null;

  return (
    <AppearanceContext.Provider
      value={{ preference, saving, error, setPreference }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance requires AppearanceProvider');
  return context;
}

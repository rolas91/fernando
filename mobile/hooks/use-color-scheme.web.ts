import { useEffect, useState } from 'react';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const { colorScheme } = useNativeWindColorScheme();

  if (hasHydrated) {
    return colorScheme ?? 'light';
  }

  return 'light';
}

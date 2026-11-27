import { nativeApplicationVersion } from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { requireApiBaseUrl } from '@/lib/api-config';
import {
  isOlderVersion,
  parseVersionPolicy,
  VersionPolicy,
} from '@/lib/mobile-version';

type GateState =
  | { kind: 'checking' | 'allowed' | 'error' }
  | { kind: 'blocked'; policy: VersionPolicy };

export function RequiredUpdateGate({ children }: PropsWithChildren) {
  if (
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return children;
  }
  if (Platform.OS === 'android' && NativeModules.PlayUpdate) {
    return (
      <PlayUpdateGate bridge={NativeModules.PlayUpdate as PlayUpdateBridge}>
        {children}
      </PlayUpdateGate>
    );
  }
  return <ServerUpdateGate>{children}</ServerUpdateGate>;
}

type PlayUpdateStatus = {
  required: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error?: string;
};

type PlayUpdateBridge = {
  check(): Promise<PlayUpdateStatus>;
  install(): Promise<void>;
};

function PlayUpdateGate({
  bridge,
  children,
}: PropsWithChildren<{ bridge: PlayUpdateBridge }>) {
  const [status, setStatus] = useState<PlayUpdateStatus>();
  const [installing, setInstalling] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const checking = useRef(false);
  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const next = await bridge.check();
      setStatus((previous) => ({
        ...next,
        required: Boolean(previous?.required || next.required),
      }));
    } catch {
      setStatus(
        (previous) =>
          previous ?? {
            required: false,
            available: false,
            downloaded: false,
            downloading: false,
            error: 'Could not check Google Play. Try again.',
          },
      );
    } finally {
      checking.current = false;
    }
  }, [bridge]);

  const required = status?.required === true;
  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    const interval = setInterval(
      () => {
        if (AppState.currentState === 'active') void check();
      },
      required ? 3_000 : 5 * 60 * 1_000,
    );
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [check, required]);

  const install = async () => {
    setActionError(undefined);
    setInstalling(true);
    try {
      await bridge.install();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not update. Try again.',
      );
    } finally {
      await check();
      setInstalling(false);
    }
  };

  if (status && !required) return children;
  if (!status) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#CC0000" />
        <Text style={styles.title}>Checking for updates…</Text>
      </View>
    );
  }

  const error = actionError || status.error;
  const busy = installing || status.downloading;
  return (
    <View style={styles.container} accessibilityViewIsModal>
      <Text accessibilityRole="header" style={styles.title}>
        Update required
      </Text>
      <Text style={styles.message}>
        Install the latest version of DR WorkOps to continue.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy || (!status.available && !status.downloaded)}
        style={[
          styles.button,
          (busy || (!status.available && !status.downloaded)) && {
            opacity: 0.55,
          },
        ]}
        onPress={() => void install()}
      >
        <Text style={styles.buttonText}>
          {status.downloading
            ? 'Downloading…'
            : installing
              ? 'Updating…'
              : status.downloaded
                ? 'Install and restart'
                : 'Download update'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.retry}
        onPress={() => {
          setActionError(undefined);
          void Linking.openURL(
            'https://play.google.com/store/apps/details?id=com.drtrafficcontrol.mobile',
          ).catch(() =>
            setActionError('Could not open Google Play. Try again.'),
          );
        }}
      >
        <Text>Open Google Play</Text>
      </Pressable>
      {error && (
        <Text accessibilityRole="alert" style={styles.message}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        style={styles.retry}
        onPress={() => {
          setActionError(undefined);
          void check();
        }}
      >
        <Text>Try again</Text>
      </Pressable>
    </View>
  );
}

function ServerUpdateGate({ children }: PropsWithChildren) {
  const bypass = Platform.OS === 'web' || Constants.appOwnership === 'expo';
  const [state, setState] = useState<GateState>({
    kind: bypass ? 'allowed' : 'checking',
  });
  const [attempt, setAttempt] = useState(0);
  const [storeError, setStoreError] = useState(false);

  useEffect(() => {
    if (bypass) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      // Keep an existing mandatory-update screen visible while checking again.
      setState((previous) =>
        previous.kind === 'error' ? { kind: 'checking' } : previous,
      );
      try {
        const response = await fetch(
          `${requireApiBaseUrl()}/mobile/version/${Platform.OS}`,
          {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' },
          },
        );
        if (!response.ok) throw new Error('Version check failed');
        const policy = parseVersionPolicy(await response.json(), Platform.OS);
        if (policy.minimumVersion && !nativeApplicationVersion)
          throw new Error('Missing native version');
        const blocked =
          policy.minimumVersion !== null &&
          isOlderVersion(nativeApplicationVersion!, policy.minimumVersion);
        if (!disposed)
          setState(blocked ? { kind: 'blocked', policy } : { kind: 'allowed' });
      } catch {
        if (!disposed)
          setState((previous) =>
            previous.kind === 'blocked' ? previous : { kind: 'error' },
          );
      } finally {
        clearTimeout(timeout);
        busy = false;
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    const interval = setInterval(
      () => {
        if (AppState.currentState === 'active') void check();
      },
      5 * 60 * 1000,
    );
    return () => {
      disposed = true;
      controller?.abort();
      subscription.remove();
      clearInterval(interval);
    };
  }, [attempt, bypass]);

  if (state.kind === 'allowed') return children;
  return (
    <View style={styles.container} accessibilityViewIsModal>
      {state.kind === 'checking' ? (
        <>
          <ActivityIndicator size="large" color="#CC0000" />
          <Text style={styles.title}>Checking for updates…</Text>
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            {state.kind === 'blocked'
              ? 'Update required'
              : 'Unable to check for updates'}
          </Text>
          <Text style={styles.message}>
            {state.kind === 'blocked'
              ? 'Install the latest version of DR WorkOps to continue.'
              : 'Connect to the internet and try again to continue.'}
          </Text>
          {state.kind === 'blocked' && (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                setStoreError(false);
                void Linking.openURL(state.policy.storeUrl!).catch(() =>
                  setStoreError(true),
                );
              }}
            >
              <Text style={styles.buttonText}>
                {Platform.OS === 'ios' ? 'Open App Store' : 'Open Google Play'}
              </Text>
            </Pressable>
          )}
          {storeError && (
            <Text accessibilityRole="alert" style={styles.message}>
              Could not open the store. Please try again.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={styles.retry}
            onPress={() => setAttempt((value) => value + 1)}
          >
            <Text>Try again</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
    marginVertical: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#4b5563',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#CC0000',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  retry: { padding: 20 },
});

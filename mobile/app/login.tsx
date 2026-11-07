import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { AUTH_MESSAGES } from '@/lib/auth-errors';

export default function LoginScreen() {
  const { themeColor } = useNativeTheme();
  const router = useRouter();
  const { login, authNotice, clearAuthNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const scrollToInput = (target: React.RefObject<TextInput | null>) => {
    const node = target.current;
    if (!node || !scrollViewRef.current) return;
    setTimeout(() => {
      node.measureLayout(
        scrollViewRef.current as unknown as React.ElementRef<typeof View>,
        (_x, y) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 24),
            animated: true,
          });
        },
        () => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        },
      );
    }, 100);
  };

  const canSubmit = !isSubmitting;

  useEffect(() => {
    if (!authNotice) return;
    setErrorMessage(authNotice);
    clearAuthNotice();
  }, [authNotice, clearAuthNotice]);

  const handleLogin = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    if (!email.trim() || !password) {
      setErrorMessage(AUTH_MESSAGES.missingCredentials);
      return;
    }
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      router.replace('/(tabs)');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : AUTH_MESSAGES.server;
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailFocus = () => scrollToInput(emailRef);

  return (
    <SafeAreaView className="flex-1 bg-slate-100 dark:bg-slate-900">
      <View className="absolute inset-0">
        <View className="h-[65%] bg-[#1c2e4a]" />
        <View className="h-[35%] bg-slate-100 dark:bg-slate-900" />
        <View className="absolute -right-16 top-20 h-56 w-56 rounded-full bg-white/10" />
        <View className="absolute -left-20 bottom-28 h-64 w-64 rounded-full bg-white/10" />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View className="items-center justify-center">
            <View className="w-full max-w-[380px]">
              <View
                className="mb-7 items-center"
                style={{ transform: [{ translateY: -16 }] }}
              >
                <View className="flex-row items-center justify-center gap-3">
                  <Image
                    source={require('@/assets/images/icon.png')}
                    resizeMode="contain"
                    className="h-16 w-16"
                  />
                  <View>
                    <Text className="text-2xl font-bold text-white">
                      DR Traffic Control
                    </Text>
                    <Text className="text-xs text-slate-100">
                      Operations Management Platform
                    </Text>
                  </View>
                </View>
              </View>

              <View className="rounded-[28px] bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
                <View className="mb-4 items-center">
                  <Text className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                    Welcome Back
                  </Text>
                  <Text className="mt-1 text-base text-slate-500 dark:text-slate-400">
                    Sign in to your account to continue
                  </Text>
                </View>

                {errorMessage ? (
                  <View className="mb-4 rounded-xl border border-red-200 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a] px-3 py-2">
                    <Text className="text-sm text-red-700 dark:text-[#fca5a5]">
                      {errorMessage}
                    </Text>
                  </View>
                ) : null}

                <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Email Address
                </Text>
                <View className="mb-4 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3">
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={themeColor('#64748B')}
                  />
                  <TextInput
                    ref={emailRef}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={handleEmailFocus}
                    placeholder="Email Address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="flex-1 px-3 py-3 text-base text-slate-800 dark:text-slate-100"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Password
                </Text>
                <View className="mb-4 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3">
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={themeColor('#64748B')}
                  />
                  <TextInput
                    ref={passwordRef}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => scrollToInput(passwordRef)}
                    placeholder="Password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    className="flex-1 px-3 py-3 text-base text-slate-800 dark:text-slate-100"
                    placeholderTextColor="#94A3B8"
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={themeColor('#64748B')}
                    />
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => setRememberMe((prev) => !prev)}
                  className="mb-5 flex-row items-center gap-2"
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-md border ${
                      rememberMe
                        ? 'border-[#CC0000] bg-[#CC0000]'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    {rememberMe ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : null}
                  </View>
                  <Text className="text-sm text-slate-600 dark:text-slate-200">
                    Remember me
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleLogin}
                  disabled={!canSubmit}
                  className={`mb-4 rounded-xl py-3.5 ${
                    canSubmit ? 'bg-[#CC0000]' : 'bg-red-300 dark:bg-[#450a0a]'
                  }`}
                >
                  {isSubmitting ? (
                    <View className="flex-row items-center justify-center gap-2">
                      <ActivityIndicator size="small" color="#fff" />
                      <Text className="text-center text-lg font-semibold text-white">
                        Signing in...
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-center text-lg font-semibold text-white">
                      Sign In
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => router.push('/forgot-password' as Href)}
                >
                  <Text className="text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                    Forgot password?
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

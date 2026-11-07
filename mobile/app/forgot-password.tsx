import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { forgotPasswordRequest } from '@/lib/auth-service';
import { AUTH_MESSAGES } from '@/lib/auth-errors';

const GENERIC_CONFIRMATION =
  'If an account exists for this email, you will receive password reset instructions.';

export default function ForgotPasswordScreen() {
  const { themeColor } = useNativeTheme();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      await forgotPasswordRequest(email.trim());
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : AUTH_MESSAGES.server,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100 dark:bg-slate-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="rounded-[28px] bg-white dark:bg-slate-800 px-6 py-8 shadow-lg">
          <View className="mb-5 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-[#450a0a]">
              <Ionicons name="key-outline" size={32} color="#CC0000" />
            </View>
            <Text className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Reset your password
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
              Enter your email and we’ll send you a secure reset link.
            </Text>
          </View>

          {sent ? (
            <View className="rounded-xl border border-emerald-200 dark:border-[#065f46] bg-emerald-50 dark:bg-[#022c22] px-4 py-3">
              <Text className="text-sm text-emerald-800 dark:text-[#6ee7b7]">
                {GENERIC_CONFIRMATION}
              </Text>
            </View>
          ) : (
            <>
              {error ? (
                <View className="mb-4 rounded-xl border border-red-200 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a] px-3 py-2">
                  <Text className="text-sm text-red-700 dark:text-[#fca5a5]">
                    {error}
                  </Text>
                </View>
              ) : null}
              <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Email Address
              </Text>
              <View className="mb-5 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3">
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={themeColor('#64748B')}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email Address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  className="flex-1 px-3 py-3 text-base text-slate-800 dark:text-slate-100"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <Pressable
                onPress={submit}
                disabled={isSubmitting}
                className="rounded-xl bg-[#CC0000] py-3.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-center text-base font-semibold text-white">
                    Send reset link
                  </Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => router.replace('/login')}
            className="mt-6 flex-row items-center justify-center gap-2"
          >
            <Ionicons
              name="arrow-back"
              size={17}
              color={themeColor('#475569')}
            />
            <Text className="text-sm font-medium text-slate-600 dark:text-slate-200">
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

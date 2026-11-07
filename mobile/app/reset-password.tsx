import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { completePasswordResetRequest } from '@/lib/auth-service';
import { AUTH_MESSAGES } from '@/lib/auth-errors';

export default function ResetPasswordScreen() {
  const { themeColor } = useNativeTheme();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token)
    ? params.token[0]
    : params.token || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (!token) {
      setError('This password reset link is invalid or has expired.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await completePasswordResetRequest(token, password);
      setComplete(true);
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
              <Ionicons name="lock-closed-outline" size={32} color="#CC0000" />
            </View>
            <Text className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Choose a new password
            </Text>
          </View>

          {complete ? (
            <>
              <View className="rounded-xl border border-emerald-200 dark:border-[#065f46] bg-emerald-50 dark:bg-[#022c22] px-4 py-3">
                <Text className="text-sm text-emerald-800 dark:text-[#6ee7b7]">
                  Your password has been reset successfully. You can now sign
                  in.
                </Text>
              </View>
              <Pressable
                onPress={() => router.replace('/login')}
                className="mt-5 rounded-xl bg-[#CC0000] py-3.5"
              >
                <Text className="text-center text-base font-semibold text-white">
                  Sign in
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {error ? (
                <View className="mb-4 rounded-xl border border-red-200 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a] px-3 py-2">
                  <Text className="text-sm text-red-700 dark:text-[#fca5a5]">
                    {error}
                  </Text>
                </View>
              ) : null}
              {[
                { label: 'New Password', value: password, setter: setPassword },
                {
                  label: 'Confirm Password',
                  value: confirmation,
                  setter: setConfirmation,
                },
              ].map((field) => (
                <View key={field.label} className="mb-4">
                  <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {field.label}
                  </Text>
                  <View className="flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3">
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={themeColor('#64748B')}
                    />
                    <TextInput
                      value={field.value}
                      onChangeText={field.setter}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      className="flex-1 px-3 py-3 text-base text-slate-800 dark:text-slate-100"
                    />
                    <Pressable
                      onPress={() => setShowPassword((current) => !current)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={themeColor('#64748B')}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
              <Pressable
                onPress={submit}
                disabled={isSubmitting}
                className="rounded-xl bg-[#CC0000] py-3.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-center text-base font-semibold text-white">
                    Save new password
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { FormEvent, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { AUTH_MESSAGES } from '@/lib/authErrors';
import { completePasswordReset } from '@/lib/passwordRecovery';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This password reset link is invalid or has expired.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await completePasswordReset(token, password);
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
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <img
          src="/drtraffic-logo.png"
          alt="DR Traffic Control"
          className="mx-auto mb-5 h-20 w-20 rounded-2xl object-contain"
        />
        <h1 className="text-center text-2xl font-bold text-slate-800">
          Choose a new password
        </h1>

        {complete ? (
          <>
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Your password has been reset successfully. You can now sign in.
            </div>
            <Link
              to="/"
              className="mt-6 block rounded-lg bg-primary py-3 text-center font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {[
              {
                label: 'New Password',
                value: password,
                setter: setPassword,
                autoComplete: 'new-password',
              },
              {
                label: 'Confirm Password',
                value: confirmPassword,
                setter: setConfirmPassword,
                autoComplete: 'new-password',
              },
            ].map((field) => (
              <div key={field.label}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {field.label}
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    autoComplete={field.autoComplete}
                    className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-11 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            ))}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 size={18} className="animate-spin" />}
              {isSubmitting ? 'Saving...' : 'Save new password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { AUTH_MESSAGES, AUTH_NOTICE_KEY } from '@/lib/authErrors';
import { Link } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { settings } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(AUTH_NOTICE_KEY);
      if (notice) {
        setError(notice);
        sessionStorage.removeItem(AUTH_NOTICE_KEY);
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(AUTH_MESSAGES.missingCredentials);
      return;
    }
    setIsSubmitting(true);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex">
      {}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1a2332] via-[#1e3a5f] to-[#0d1b2a] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-red-500/10 rounded-full translate-x-1/4 translate-y-1/4" />
          <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-blue-400/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="mb-2">
              <img
                src={settings.logo || '/drtraffic-logo-horizontal-white.png'}
                alt="DR Traffic Control"
                className="h-20 w-auto max-w-sm object-contain"
              />
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-white leading-tight">
                Manage your
                <br />
                traffic operations
                <br />
                <span className="text-blue-400">with confidence.</span>
              </h2>
              <p className="text-gray-400 mt-4 text-lg max-w-md">
                Schedule crews, track time, manage equipment, and streamline
                field operations — all from one powerful platform.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <div className="text-3xl font-bold text-white">24/7</div>
                <div className="text-sm text-gray-400 mt-1">
                  Real-time Scheduling
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <div className="text-3xl font-bold text-white">100%</div>
                <div className="text-sm text-gray-400 mt-1">Digital Forms</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <div className="text-3xl font-bold text-white">50%</div>
                <div className="text-sm text-gray-400 mt-1">
                  Less Admin Time
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <div className="text-3xl font-bold text-white">GPS</div>
                <div className="text-sm text-gray-400 mt-1">Job Tracking</div>
              </div>
            </div>
          </div>

          <p className="text-gray-500 text-sm">
            Powered by DR Traffic Control, LLC
          </p>
        </div>
      </div>

      {}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img
              src={settings.logoIcon || settings.logo || '/drtraffic-logo.png'}
              alt="DR Traffic Control"
              className="h-10 w-10 rounded-lg object-contain bg-white"
            />
            <h1 className="text-xl font-bold text-gray-800">
              DR Traffic Control
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
            <div className="text-center mb-8">
              <img
                src={
                  settings.logoIcon || settings.logo || '/drtraffic-logo.png'
                }
                alt="DR Traffic Control"
                className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain bg-white"
              />
              <h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2>
              <p className="text-gray-500 mt-1">
                Sign in to your account to continue
              </p>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="you@drtrafficcontrol.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            DR Traffic Control Operations Platform v1.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

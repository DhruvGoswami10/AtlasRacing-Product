import { useCallback, useMemo, useState } from 'react';
import { Loader2, Mail, Lock, LogIn, LogOut, UserPlus, Eye, EyeOff, CheckCircle2, AlertCircle, Chrome } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import supabase from '../../lib/supabaseClient';

type AuthMode = 'login' | 'signup';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

export function AuthScreen() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle, rememberMe, setRememberMe } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    setFeedback(null);
  }, []);

  const headline = mode === 'login' ? 'Sign in to Atlas Racing' : 'Create your Atlas account';
  const submitLabel = mode === 'login' ? 'Log in' : 'Sign up';
  const toggleLabel = mode === 'login' ? "Don't have an account?" : 'Already have an account?';
  const toggleCta = mode === 'login' ? 'Create one' : 'Log in';

  const canSubmit = useMemo(() => email.trim().length > 3 && password.trim().length >= 6, [email, password]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const handler = mode === 'login' ? signInWithPassword : signUpWithPassword;
    const result = await handler(email.trim(), password);

    if (result.error) {
      setFeedback({ type: 'error', message: result.error });
    } else if (mode === 'signup') {
      setFeedback({
        type: 'success',
        message: 'Check your inbox to confirm your account. You can sign in once verified.'
      });
    } else {
      setFeedback(null);
    }

    setIsSubmitting(false);
  }, [canSubmit, email, password, isSubmitting, mode, signInWithPassword, signUpWithPassword]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setFeedback({ type: 'error', message: 'Enter your email above to receive a reset link.' });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://yligdiorizqcapugvqph.supabase.co/auth/v1/callback'
    });

    if (error) {
      setFeedback({ type: 'error', message: error.message });
      return;
    }

    setFeedback({ type: 'success', message: 'Password reset email sent. Check your inbox.' });
  }, [email]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsSubmitting(true);
    const { error } = await signInWithGoogle();

    if (error) {
      setFeedback({ type: 'error', message: error });
    }
    setIsSubmitting(false);
  }, [signInWithGoogle]);

  return (
    <div className="flex min-h-screen flex-col bg-[#05060c] py-12 px-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <img
            src={`${process.env.PUBLIC_URL}/Atlas-logo-white-txt.png`}
            alt="Atlas Racing"
            className="h-16 w-auto opacity-90"
          />
          <p className="max-w-sm text-sm text-slate-400">
            Welcome back. Sync your telemetry and race-day tools across website and desktop.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="text-xl font-semibold tracking-wide text-white">{headline}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Use the same account you created on the website to keep your downloads and subscriptions aligned.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block text-xs uppercase tracking-widest text-slate-400">
              Email Address
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 focus-within:border-red-500/60">
                <Mail className="h-4 w-4 text-red-400" />
                <input
                  type="email"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>

            <label className="block text-xs uppercase tracking-widest text-slate-400">
              Password
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 focus-within:border-red-500/60">
                <Lock className="h-4 w-4 text-red-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="text-slate-400 transition hover:text-slate-200"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between text-sm text-slate-400">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border border-slate-600 bg-transparent text-red-500 focus:ring-red-500"
                />
                Remember me on this device
              </label>
              <button
                type="button"
                className="text-xs font-medium text-red-300 transition hover:text-red-200"
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`mt-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                feedback.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/40 bg-red-500/10 text-red-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={handleSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 px-4 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {submitLabel}
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-medium text-white transition hover:border-white/25"
              disabled={isSubmitting}
            >
              <Chrome className="h-4 w-4 text-red-300" />
              Continue with Google
            </button>
          </div>

          <div className="mt-6 text-center text-xs uppercase tracking-[0.3em] text-slate-500">
            <button
              type="button"
              onClick={toggleMode}
              className="inline-flex items-center gap-1 text-slate-300 transition hover:text-white"
            >
              <span>{toggleLabel}</span>
              <span className="font-semibold text-red-200">{toggleCta}</span>
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          By continuing you agree to the Atlas Racing{' '}
          <button type="button" className="text-red-300 underline decoration-dotted underline-offset-2">
            Terms
          </button>{' '}
          and{' '}
          <button type="button" className="text-red-300 underline decoration-dotted underline-offset-2">
            Privacy Policy
          </button>
          .
        </p>
      </div>
    </div>
  );
}

export default AuthScreen;

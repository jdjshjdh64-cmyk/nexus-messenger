import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Zap, Mail, ArrowLeft } from 'lucide-react';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (mode === 'reset') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess('Password reset link sent to your email');
        setTimeout(() => setMode('login'), 3000);
      }
      setLoading(false);
      return;
    }

    if (mode === 'register') {
      if (username.trim().length < 3) {
        setError('Username must be at least 3 characters');
        setLoading(false);
        return;
      }
      if (displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, username.trim(), displayName.trim());
      if (error) setError(error);
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0f] safe-areas">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-purple-radial" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 w-full max-w-md anim-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-purple neon-purple-strong mb-4">
            <Zap className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-bold neon-text tracking-tight">NEXUS</h1>
          <p className="text-purple-300/60 text-sm mt-2 font-medium tracking-wide">NEXT-GEN MESSAGING</p>
        </div>

        {/* Auth card */}
        <div className="glass-panel rounded-2xl p-8 neon-border">
          {mode !== 'reset' && (
            <div className="flex gap-2 mb-6 p-1 bg-[#0a0a0f]/60 rounded-xl">
              <button
                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'login' ? 'gradient-purple text-white neon-purple' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode('register'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'register' ? 'gradient-purple text-white neon-purple' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <button
              onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
              className="flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="text-xs font-medium text-purple-300/70 mb-1.5 block">USERNAME</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="unique_username"
                    className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-purple-300/70 mb-1.5 block">DISPLAY NAME</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-sm"
                    required
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-purple-300/70 mb-1.5 block">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-sm"
                required
              />
            </div>
            {mode !== 'reset' && (
              <div>
                <label className="text-xs font-medium text-purple-300/70 mb-1.5 block">PASSWORD</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-sm"
                  required
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 anim-fade-in">
                {error}
              </div>
            )}

            {success && (
              <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 anim-fade-in">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-purple text-white font-semibold py-3.5 rounded-xl neon-purple hover:neon-purple-strong transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'reset' ? (
                <>
                  <Mail className="w-5 h-5" />
                  Send Reset Link
                </>
              ) : mode === 'login' ? (
                'Sign In to NEXUS'
              ) : (
                'Create NEXUS Account'
              )}
            </button>
          </form>

          {mode === 'login' && (
            <button
              onClick={() => { setMode('reset'); setError(null); setSuccess(null); }}
              className="w-full text-center text-xs text-purple-300/50 hover:text-purple-300 transition-colors mt-4"
            >
              Forgot password?
            </button>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          The first account created becomes the owner & admin
        </p>
      </div>
    </div>
  );
}

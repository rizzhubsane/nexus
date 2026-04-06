'use client';

import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/db/supabase';

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createBrowserSupabase();

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      window.location.href = '/';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-sm space-y-8 rounded-3xl border border-[#444444] bg-[#1F2023]/80 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.24)] backdrop-blur-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">NEXUS</h1>
          <p className="mt-2 text-sm text-gray-400">Your AI that knows you</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-xl border border-[#444444] bg-[#1F2023] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-400 outline-none transition focus:border-white/50 focus:ring-1 focus:ring-white/50"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full rounded-xl border border-[#444444] bg-[#1F2023] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-400 outline-none transition focus:border-white/50 focus:ring-1 focus:ring-white/50"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white py-3 text-sm font-medium text-black transition hover:bg-white/80 disabled:opacity-50"
          >
            {loading ? '...' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-white hover:underline font-medium"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

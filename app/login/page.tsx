"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, Lock, Sparkles, TriangleAlert } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Sign-in failed (HTTP ${res.status})`);

      // Only allow same-site relative redirects.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_70%)]"
      />
      <form onSubmit={onSubmit} className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-2.5">
            <Lock className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Keyword & AEO Research</h1>
            <p className="flex items-center gap-1 text-xs text-zinc-500">
              <Sparkles className="h-3 w-3" />
              Private workspace — enter password
            </p>
          </div>
        </div>

        <label htmlFor="password" className="block text-xs font-medium text-zinc-700">
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 pr-10 pl-3 text-sm text-zinc-900 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

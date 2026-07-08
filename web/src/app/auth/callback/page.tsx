"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeDiscordCode } from "@/lib/api";
import { storeSession } from "@/lib/auth";
import { AlertIcon, MusicIcon } from "@/components/icons";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing OAuth code. Please try signing in again.");
      return;
    }

    void exchangeDiscordCode(code)
      .then((session) => {
        storeSession(session.token, session.user);
        router.replace("/dashboard");
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, [router, searchParams]);

  return (
    <div className="card w-full max-w-md px-8 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
        {error ? <AlertIcon className="h-6 w-6 text-rose-400" /> : <MusicIcon className="h-6 w-6 text-emerald-400" />}
      </span>
      {error ? (
        <>
          <h1 className="mt-5 text-xl font-bold text-white">Sign in failed</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{error}</p>
          <Link href="/" className="btn-secondary mt-6">
            Back to home
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-5 text-xl font-bold text-white">Signing you in</h1>
          <p className="mt-2 text-sm text-slate-400">Completing Discord authentication...</p>
          <div className="mx-auto mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/5">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500" />
          </div>
        </>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Suspense
        fallback={
          <div className="card w-full max-w-md px-8 py-10 text-center">
            <h1 className="text-xl font-bold text-white">Signing you in</h1>
          </div>
        }
      >
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}

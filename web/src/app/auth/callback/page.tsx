"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeDiscordCode } from "@/lib/api";
import { storeSession } from "@/lib/auth";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing OAuth code.");
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold text-rose-300">Sign in failed</h1>
          <p className="mt-3 text-sm text-zinc-400">{error}</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Signing you in</h1>
          <p className="mt-3 text-sm text-zinc-400">Completing Discord authentication...</p>
        </>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-6 text-white">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10 text-center">
            <h1 className="text-xl font-semibold">Signing you in</h1>
          </div>
        }
      >
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";

import { LoginPageContent } from "@/app/_components/login-page-content";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Suspense fallback={<LoginPageFallback />}>
        <LoginPageContent />
      </Suspense>
    </main>
  );
}

function LoginPageFallback() {
  return <div className="w-full max-w-lg animate-pulse rounded-xl border p-6" />;
}

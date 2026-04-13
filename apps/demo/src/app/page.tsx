import { Suspense } from "react";

import { CheckoutPageContent } from "@/app/_components/checkout-page-content";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
      <Suspense fallback={<CheckoutPageFallback />}>
        <CheckoutPageContent />
      </Suspense>
    </main>
  );
}

function CheckoutPageFallback() {
  return <div className="h-96 w-full animate-pulse rounded-xl border" />;
}

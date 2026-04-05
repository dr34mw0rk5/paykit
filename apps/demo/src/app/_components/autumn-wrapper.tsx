"use client";

import { AutumnProvider } from "autumn-js/react";

export function AutumnWrapper({ children }: { children: React.ReactNode }) {
  return <AutumnProvider pathPrefix="/api/autumn">{children}</AutumnProvider>;
}

import "@/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";

import { AutumnWrapper } from "@/app/_components/autumn-wrapper";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "PayKit Demo",
  description: "Billing sandbox for PayKit & Autumn",
};

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${fontSans.variable}`}>
      <body>
        <TRPCReactProvider>
          <AutumnWrapper>{children}</AutumnWrapper>
        </TRPCReactProvider>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}

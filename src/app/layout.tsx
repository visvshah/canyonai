import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import Sidebar from "~/components/Sidebar";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Canyon CPQ",
  description: "Quoting and approvals for modern SaaS sales teams.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="flex min-h-screen bg-[#091625] text-white">
        <Sidebar />
          <main className="flex-1 bg-white text-[#091625] ml-16 lg:ml-64">
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </main>
      </body>
    </html>
  );
}

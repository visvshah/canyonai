import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { Box } from "@mui/material";
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
      <body>
        <TRPCReactProvider>
          <Box sx={{ display: "flex" }}>
            <Sidebar />
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                bgcolor: "transparent",
                p: 0,
              }}
            >
              {children}
            </Box>
          </Box>
        </TRPCReactProvider>
      </body>
    </html>
  );
}

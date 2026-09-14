import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import "./repairs.css";

// Self-hosted at build time: no third-party font request in the critical path.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Velocity Growth | Campaign Portal",
  description: "Secure client campaign reporting and sending portal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}

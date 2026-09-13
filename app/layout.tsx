import type { Metadata } from "next";
import "./globals.css";
import "./repairs.css";

export const metadata: Metadata = {
  title: "Velocity Growth | Campaign Portal",
  description: "Secure client campaign reporting and sending portal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

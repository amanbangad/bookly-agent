import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookly Support",
  description: "Customer support agent for Bookly",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

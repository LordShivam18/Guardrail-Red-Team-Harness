import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardrail & Red-Team Harness",
  description: "Dashboard for measuring AI guardrail robustness."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

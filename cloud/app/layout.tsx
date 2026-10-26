import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SALCheck · Dichiarazioni e storico",
  description: "Dichiarazioni RA, confronto settimanale e storico condiviso.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}


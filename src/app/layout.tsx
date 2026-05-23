import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roxstar Spin Wheel - Premium Multiplayer Game System",
  description: "Experience high-fidelity, real-time multiplayer spin wheel tournaments. Join now with entry coins and compete in a fully fair and transparent prize pool distribution system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

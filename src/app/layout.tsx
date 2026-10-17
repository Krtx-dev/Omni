import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMNI",
  description: "An open-source real-time world model built from public data. Earth has APIs. OMNI connects them.",
};

export const viewport: Viewport = {
  themeColor: "#030508",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

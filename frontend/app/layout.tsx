import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CineSeek — Search the feeling",
  description:
    "Explainable movie search and relevance evaluation built on MovieLens.",
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

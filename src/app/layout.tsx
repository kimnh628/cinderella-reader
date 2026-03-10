import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cinderella - AI Storybook Reader",
  description: "An AI avatar reads the Cinderella fairy tale aloud",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

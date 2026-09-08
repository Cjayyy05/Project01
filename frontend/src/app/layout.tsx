import type { Metadata } from "next";

import { Navigation } from "@/components/navigation";
import { AuthProvider } from "@/context/auth-context";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DeployFlow",
    template: "%s · DeployFlow",
  },
  description: "Build and run trusted GitHub projects on your own infrastructure.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Navigation />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

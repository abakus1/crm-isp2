import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata = { title: "CRM Cockpit" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
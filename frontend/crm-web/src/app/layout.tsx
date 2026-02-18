import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { PermissionsProvider } from "@/lib/permissions";

export const metadata = { title: "CRM Cockpit" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <PermissionsProvider>{children}</PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

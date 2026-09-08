import { ProtectedRoute } from "@/components/protected-route";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

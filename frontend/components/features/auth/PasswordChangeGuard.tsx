"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const REQUIRED_PATH = "/account/change-password-required";

export function PasswordChangeGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user?.must_change_password) return;
    if (!pathname?.startsWith(REQUIRED_PATH)) {
      router.replace(REQUIRED_PATH);
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) return null;
  if (user?.must_change_password && !pathname?.startsWith(REQUIRED_PATH)) {
    return (
      <div className="flex items-center justify-center py-20 text-muted text-sm">
        Redirigiendo…
      </div>
    );
  }
  return <>{children}</>;
}

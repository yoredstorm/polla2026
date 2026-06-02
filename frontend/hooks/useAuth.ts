"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getMe, login, logout, register, type LoginResponse } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_AUTH_ROUTES = ["/login", "/register"];

export function useAuth() {
  const { user, setUser, setLoading, clearUser } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const skipMeFetch = PUBLIC_AUTH_ROUTES.some((r) => pathname?.startsWith(r));

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: !skipMeFetch,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (me) setUser(me);
    else if (!isLoading) clearUser();
  }, [me, isLoading]);

  const loginMutation = useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string;
      password: string;
      redirectTo?: string;
    }) => login(username, password),
    onSuccess: (data: LoginResponse, variables) => {
      if (data.user) setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      if (data?.user?.must_change_password) {
        router.push("/account/change-password-required");
        return;
      }
      const target =
        variables.redirectTo && variables.redirectTo.startsWith("/") && !variables.redirectTo.startsWith("//")
          ? variables.redirectTo
          : "/dashboard";
      router.push(target);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      clearUser();
      queryClient.clear();
      router.push("/login");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: {
      username: string;
      password: string;
      first_name: string;
      last_name: string;
    }) => register(payload),
    onSuccess: () => {
      router.push("/login");
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation,
    logout: logoutMutation,
    register: registerMutation,
  };
}

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getMe, login, logout, register } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuth() {
  const { user, setUser, setLoading, clearUser } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
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
    onSuccess: (data: any, variables) => {
      if (data?.user) setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      const target =
        variables.redirectTo && variables.redirectTo.startsWith("/") && !variables.redirectTo.startsWith("//")
          ? variables.redirectTo
          : "/dashboard";
      router.push(target);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearUser();
      queryClient.clear();
      router.push("/login");
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      register(username, password),
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

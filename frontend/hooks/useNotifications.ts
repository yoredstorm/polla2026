"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Notification, PaginatedResponse } from "@/types/api";

export type NotificationFilter = "unread" | "read" | "all";
export type NotificationCategory =
  | "all"
  | "challenges"
  | "fixtures"
  | "social"
  | "admin"
  | "system";

export function useNotifications(
  page = 1,
  limit = 20,
  filter: NotificationFilter = "all",
  category: NotificationCategory = "all",
) {
  return useQuery({
    queryKey: ["notifications", page, limit, filter, category],
    queryFn: () =>
      api.get<PaginatedResponse<Notification>>("/notifications", {
        page,
        limit,
        filter,
        ...(category !== "all" ? { category } : {}),
      }),
    staleTime: 10_000,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    enabled,
    staleTime: 5_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch<Notification>(`/notifications/${notificationId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ marked: number }>("/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

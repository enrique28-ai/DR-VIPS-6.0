import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import { NOTIFICATIONS_ENABLED } from "../../config/features.js";

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get("/notifications?limit=30");
      return data; // { items, unreadCount }
    },
    enabled: NOTIFICATIONS_ENABLED,
    refetchInterval: NOTIFICATIONS_ENABLED ? 30000 : false,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useMarkNotifRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotifsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.put(`/notifications/read-all`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

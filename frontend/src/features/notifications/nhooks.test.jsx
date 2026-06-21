import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import {
  useMarkAllNotifsRead,
  useMarkNotifRead,
  useNotifications,
} from "./nhooks.js";

vi.mock("../../lib/axios.js", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe("notification hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("useNotifications fetches and returns the notification payload", async () => {
    const payload = {
      items: [{ _id: "notification-1", title: "New appointment" }],
      unreadCount: 1,
    };
    api.get.mockResolvedValueOnce({ data: payload });

    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/notifications?limit=30");
    expect(result.current.data).toEqual(payload);
  });

  test("useMarkNotifRead marks one notification read and invalidates notifications", async () => {
    api.put.mockResolvedValueOnce({ data: { ok: true } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useMarkNotifRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("notification-1");
    });

    expect(api.put).toHaveBeenCalledWith("/notifications/notification-1/read");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  test("useMarkAllNotifsRead marks all notifications read and invalidates notifications", async () => {
    api.put.mockResolvedValueOnce({ data: { ok: true } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useMarkAllNotifsRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(api.put).toHaveBeenCalledWith("/notifications/read-all");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });
});

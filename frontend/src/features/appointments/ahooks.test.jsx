import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import toast from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import {
  useAcceptAppointment,
  useAppointments,
  useCreateAppointment,
  useRejectAppointment,
} from "./ahooks.js";

vi.mock("../../lib/axios.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../i18n", () => ({
  default: {
    t: (key) => key,
  },
}));

describe("appointment hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("useAppointments fetches appointments and normalizes dates", async () => {
    const appointment = {
      _id: "appointment-1",
      doctor: { _id: "doctor-1", fullname: "Dr Example" },
      patient: { _id: "patient-1", fullname: "Patient Example" },
      start: "2026-06-21T17:00:00.000Z",
      end: "2026-06-21T17:30:00.000Z",
    };
    api.get.mockResolvedValueOnce({ data: [appointment] });

    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useAppointments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/appointments");
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].start).toBeInstanceOf(Date);
    expect(result.current.data[0].end).toBeInstanceOf(Date);
    expect(result.current.data[0].start.toISOString()).toBe(appointment.start);
    expect(result.current.data[0].end.toISOString()).toBe(appointment.end);
    expect(result.current.data[0].titleData).toEqual({
      doctor: appointment.doctor,
      patient: appointment.patient,
    });
  });

  test("useCreateAppointment posts payload, shows success toast, and invalidates appointments", async () => {
    const payload = {
      patientId: "patient-1",
      start: "2026-06-21T17:00:00.000Z",
      end: "2026-06-21T17:30:00.000Z",
      reason: "Follow up visit",
    };
    api.post.mockResolvedValueOnce({ data: { _id: "appointment-1" } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(api.post).toHaveBeenCalledWith("/appointments", payload);
    expect(toast.success).toHaveBeenCalledWith("calendar.toasts.createSuccess");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["appointments"] });
  });

  test("useAcceptAppointment accepts by id, shows success toast, and invalidates appointments", async () => {
    api.put.mockResolvedValueOnce({ data: { _id: "appointment-1", status: "accepted" } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useAcceptAppointment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("appointment-1");
    });

    expect(api.put).toHaveBeenCalledWith("/appointments/appointment-1/accept");
    expect(toast.success).toHaveBeenCalledWith("calendar.toasts.acceptSuccess");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["appointments"] });
  });

  test("useRejectAppointment deletes by id, shows success toast, and invalidates appointments", async () => {
    api.delete.mockResolvedValueOnce({ data: { ok: true } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useRejectAppointment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("appointment-1");
    });

    expect(api.delete).toHaveBeenCalledWith("/appointments/appointment-1");
    expect(toast.success).toHaveBeenCalledWith("calendar.toasts.deleteSuccess");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["appointments"] });
  });

  test("useCreateAppointment maps deceased patient error codes to the stable calendar error key", async () => {
    const error = {
      response: {
        data: {
          errorCode: "APPOINTMENT_PATIENT_DECEASED",
        },
      },
    };
    api.post.mockRejectedValueOnce(error);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ patient: "patient-1" });
      }),
    ).rejects.toBe(error);

    expect(toast.error).toHaveBeenCalledWith("calendar.errors.patientDeceased");
  });

  test("useAcceptAppointment maps unavailable guardian error codes to the stable calendar error key", async () => {
    const error = {
      response: {
        data: {
          errorCode: "APPOINTMENT_GUARDIAN_UNAVAILABLE",
        },
      },
    };
    api.put.mockRejectedValueOnce(error);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useAcceptAppointment(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("appointment-1");
      }),
    ).rejects.toBe(error);

    expect(api.put).toHaveBeenCalledWith("/appointments/appointment-1/accept");
    expect(toast.error).toHaveBeenCalledWith("calendar.errors.guardianUnavailable");
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { useAuthStore } from "../../stores/authStore.js";
import { toast } from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import {
  buildDiagnosisParams,
  useCreateDiagnosis,
  useDiagnosesByPatient,
  useDiagnosisHistory,
  useMyChildDiagnosisHistory,
  useUpdateDiagnosis,
} from "./dhooks.js";

beforeEach(() => useAuthStore.setState({
  user: { _id: "synthetic-doctor", role: "doctor", isVerified: true },
  isAuthenticated: true, isCheckingAuth: false,
}));

vi.mock("../../lib/axios.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

describe("diagnosis hook helpers", () => {
  test("normalizes diagnosis list params for cache keys and requests", () => {
    expect(
      buildDiagnosisParams({
        q: "  flu  ",
        hasMedicines: "Yes",
        hasTreatments: "No",
        hasOperations: "All",
        page: 4,
      }),
    ).toEqual({
      q: "flu",
      hasMedicines: true,
      hasTreatments: false,
      hasOperations: undefined,
      page: 4,
    });
  });

  test("omits default diagnosis list filters", () => {
    expect(buildDiagnosisParams({})).toEqual({
      q: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });

  test.each([
    ["America/Tijuana", "2026-11-08", "2026-11-08T08:00:00.000Z", "2026-11-09T08:00:00.000Z"],
    ["America/Tijuana", "2026-11-09", "2026-11-09T08:00:00.000Z", "2026-11-10T08:00:00.000Z"],
    ["Asia/Tokyo", "2026-11-09", "2026-11-08T15:00:00.000Z", "2026-11-09T15:00:00.000Z"],
    ["America/Tijuana", "2026-03-08", "2026-03-08T08:00:00.000Z", "2026-03-09T07:00:00.000Z"],
    ["America/Tijuana", "2026-11-01", "2026-11-01T07:00:00.000Z", "2026-11-02T08:00:00.000Z"],
    ["Asia/Tokyo", "2024-02-29", "2024-02-28T15:00:00.000Z", "2024-02-29T15:00:00.000Z"],
  ])("serializes the local day in %s for %s", (zone, date, dateStart, dateEnd) => {
    vi.stubEnv("TZ", zone);
    try {
      const params = buildDiagnosisParams({ date });
      expect(params).toMatchObject({ dateStart, dateEnd });
      expect(params).not.toHaveProperty("date");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test.each(["2026-02-29", "2026-11-31", "2026-13-01", "11/08/2026"])(
    "omits a range for invalid calendar input %s",
    (date) => expect(buildDiagnosisParams({ date })).not.toHaveProperty("dateStart"),
  );
});

test("diagnosis pagination can keep the name for the same patient but switching patients cannot", async () => {
  const response = Promise.withResolvers();
  api.get.mockResolvedValueOnce({ data: { patientName: "First patient", items: [] } })
    .mockReturnValue(response.promise);
  const { result, rerender } = renderHook(({ patientId, page }) => useDiagnosesByPatient(patientId, { page }), {
    initialProps: { patientId: "first", page: 1 },
    wrapper: createQueryWrapper(),
  });
  await waitFor(() => expect(result.current.data?.patientName).toBe("First patient"));
  rerender({ patientId: "first", page: 2 });
  expect(result.current.data?.patientName).toBe("First patient");
  rerender({ patientId: "second", page: 1 });
  expect(result.current.data).toBeUndefined();
  await act(async () => response.resolve({ data: { patientName: "Second patient", items: [] } }));
  await waitFor(() => expect(result.current.data?.patientName).toBe("Second patient"));
  api.get.mockReset();
});

test.each([
  ["diagnosis", (id) => useDiagnosisHistory(id), "/diagnoses/second/history"],
  ["child", (id) => useMyChildDiagnosisHistory(id, "diagnosis"), "/diagnoses/children/second/mine/diagnosis/history"],
])("history isolates %s queries when switching records", async (_scope, useHistory, nextUrl) => {
  const response = Promise.withResolvers();
  api.get.mockResolvedValueOnce({ data: [{ _id: "first-version" }] }).mockReturnValueOnce(response.promise);
  const { result, rerender } = renderHook(({ id }) => useHistory(id), {
    initialProps: { id: "first" },
    wrapper: createQueryWrapper(),
  });
  await waitFor(() => expect(result.current.data).toEqual([{ _id: "first-version" }]));
  rerender({ id: "second" });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(nextUrl, { signal: expect.any(AbortSignal) }));
  await act(async () => response.resolve({ data: [{ _id: "second-version" }] }));
  await waitFor(() => expect(result.current.data).toEqual([{ _id: "second-version" }]));
  api.get.mockReset();
});

test("a successful edit invalidates the edited diagnosis history without invalidating another record", async () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(["diagnosis-history", "edited"], []);
  queryClient.setQueryData(["diagnosis-history", "other"], []);
  api.put.mockResolvedValueOnce({ data: { _id: "edited" } });
  const { result } = renderHook(() => useUpdateDiagnosis("edited", "patient"), {
    wrapper: createQueryWrapper(queryClient),
  });
  await act(() => result.current.mutateAsync({ title: "Edited title" }));
  expect(queryClient.getQueryState(["diagnosis-history", "edited"]).isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["diagnosis-history", "other"]).isInvalidated).toBe(false);
});

describe("useCreateDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("rolls back the optimistic diagnosis list update when create fails", async () => {
    const patientId = "patient-1";
    const params = buildDiagnosisParams({ q: "flu", page: 1 });
    const queryKey = ["diagnoses", patientId, params];
    const originalList = {
      items: [{ _id: "diagnosis-1", title: "Existing diagnosis" }],
      total: 1,
      page: 1,
      pages: 1,
    };
    const error = { response: { status: 500 } };
    api.post.mockRejectedValueOnce(error);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKey, originalList);
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useCreateDiagnosis(patientId), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          title: "New diagnosis",
          description: "New description",
          medicine: [],
          treatment: [],
          operation: [],
        });
      }),
    ).rejects.toBe(error);

    expect(api.post).toHaveBeenCalledWith("/diagnoses", {
      patient: patientId,
      title: "New diagnosis",
      description: "New description",
      medicine: [],
      treatment: [],
      operation: [],
    });
    expect(queryClient.getQueryData(queryKey)).toEqual(originalList);
    expect(toast.error).toHaveBeenCalledWith("diagnoses.toasts.createFailed");
  });
});

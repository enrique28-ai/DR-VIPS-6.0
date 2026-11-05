import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import { buildDiagnosisParams, useCreateDiagnosis } from "./dhooks.js";

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
        date: "2026-06-21",
        page: 4,
      }),
    ).toEqual({
      q: "flu",
      date: "2026-06-21",
      hasMedicines: true,
      hasTreatments: false,
      hasOperations: undefined,
      page: 4,
    });
  });

  test("omits default diagnosis list filters", () => {
    expect(buildDiagnosisParams({})).toEqual({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });
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

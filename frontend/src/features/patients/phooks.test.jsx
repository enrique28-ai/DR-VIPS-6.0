import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import { buildPatientParams, useReassignGuardian } from "./phooks.js";

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

describe("patient hook helpers", () => {
  test("normalizes patient list params for cache keys and requests", () => {
    expect(
      buildPatientParams({
        q: "  ana  ",
        category: "adult",
        bloodtype: "O+",
        gender: "Female",
        organDonor: "Yes",
        bloodDonor: "No",
        bmiCategory: "Overweight",
        status: "Deceased",
        country: "Mexico",
        hasDiseases: "Yes",
        hasAllergies: "No",
        hasMedications: "All",
        page: 3,
      }),
    ).toEqual({
      q: "ana",
      category: "adult",
      bloodtype: "O+",
      gender: "female",
      organDonor: true,
      bloodDonor: false,
      bmiCategory: "overweight",
      deceased: true,
      country: "Mexico",
      hasDiseases: true,
      hasAllergies: false,
      hasMedications: undefined,
      page: 3,
    });
  });

  test("omits default patient list filters", () => {
    expect(buildPatientParams({})).toEqual({
      q: undefined,
      category: undefined,
      bloodtype: undefined,
      gender: undefined,
      organDonor: undefined,
      bloodDonor: undefined,
      bmiCategory: undefined,
      deceased: undefined,
      country: undefined,
      hasDiseases: undefined,
      hasAllergies: undefined,
      hasMedications: undefined,
      page: 1,
    });
  });
});

describe("useReassignGuardian", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("caches the returned patient and invalidates related patient, child, and appointment queries", async () => {
    const patientId = "patient-1";
    const updatedPatient = {
      _id: "updated-patient-1",
      fullname: "Minor Example",
      parentEmail: "new-parent@example.com",
    };
    api.patch.mockResolvedValueOnce({ data: { patient: updatedPatient } });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(() => useReassignGuardian(patientId), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ newParentEmail: "new-parent@example.com" });
    });

    expect(api.patch).toHaveBeenCalledWith(`/patients/${patientId}/guardian`, {
      newParentEmail: "new-parent@example.com",
    });
    expect(queryClient.getQueryData(["patient", updatedPatient._id])).toEqual(updatedPatient);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["patients"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["patient", updatedPatient._id] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["appointments"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["my-children-health-info"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["child-history"] });
    expect(toast.success).toHaveBeenCalledWith("patients.toasts.guardianReassignSuccess");
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import {
  buildPatientParams,
  useApprovePatientAccessRequest,
  useImportPatient,
  useMyPatientAccessRequests,
  useReassignGuardian,
  useRejectPatientAccessRequest,
} from "./phooks.js";

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

describe("useImportPatient legacy access-request compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("treats a 202 pending response as a request and never seeds ownership caches", async () => {
    const patientId = "patient-1";
    const preview = { _id: patientId, fullname: "Patient One", amIOwner: false };
    const ownedPatients = { items: [], total: 0, page: 1, pages: 1 };
    api.post.mockResolvedValueOnce({
      data: {
        accessRequest: {
          _id: "request-1",
          patient: { _id: patientId, fullname: "Patient One" },
          status: "pending",
        },
      },
    });

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["patient-global", patientId], preview);
    queryClient.setQueryData(["patients"], ownedPatients);
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useImportPatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(patientId);
    });

    expect(api.post).toHaveBeenCalledWith(`/patients/import/${patientId}`);
    expect(queryClient.getQueryData(["patient-global", patientId])).toEqual(preview);
    expect(queryClient.getQueryData(["patients"])).toEqual(ownedPatients);
    expect(queryClient.getQueryData(["patient", patientId])).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("patients.toasts.importSuccess");
  });

  test("does not announce success for an unexpected 2xx response shape", async () => {
    api.post.mockResolvedValueOnce({ data: { patient: { _id: "patient-1" } } });

    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result } = renderHook(() => useImportPatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("patient-1");
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("patients.toasts.importFailed");
  });
});

describe("patient access request hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("useMyPatientAccessRequests returns the unchanged pending response", async () => {
    const response = {
      accessRequests: [
        {
          _id: "request-1",
          patient: { _id: "patient-1", fullname: "Patient One" },
          doctor: { _id: "doctor-1", name: "Doctor One", email: "doctor@example.com" },
          status: "pending",
        },
      ],
    };
    api.get.mockResolvedValueOnce({ data: response });

    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result } = renderHook(() => useMyPatientAccessRequests(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/patients/me/access-requests");
    expect(result.current.data).toEqual(response);
  });

  test("approve posts only the request id, invalidates the inbox, and shows success", async () => {
    api.post.mockResolvedValueOnce({
      data: { accessRequest: { _id: "request-1", status: "approved" } },
    });
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useApprovePatientAccessRequest(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("request-1");
    });

    expect(api.post).toHaveBeenCalledWith(
      "/patients/me/access-requests/request-1/approve",
    );
    expect(api.post.mock.calls[0]).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["my-patient-access-requests"],
    });
    expect(toast.success).toHaveBeenCalledWith("accessRequests.approveSuccess");
  });

  test("approve stays pending until the authoritative inbox refresh finishes", async () => {
    api.post.mockResolvedValueOnce({
      data: { accessRequest: { _id: "request-1", status: "approved" } },
    });
    let finishRefresh;
    const refreshPromise = new Promise((resolve) => {
      finishRefresh = resolve;
    });
    const queryClient = createTestQueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(refreshPromise);
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useApprovePatientAccessRequest(), { wrapper });
    let mutationSettled = false;

    let mutationPromise;
    await act(async () => {
      mutationPromise = result.current.mutateAsync("request-1").then(() => {
        mutationSettled = true;
      });
      await Promise.resolve();
    });

    expect(mutationSettled).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      finishRefresh();
      await mutationPromise;
    });

    expect(mutationSettled).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("accessRequests.approveSuccess");
  });

  test("reject posts only the request id, invalidates the inbox, and shows success", async () => {
    api.post.mockResolvedValueOnce({
      data: { accessRequest: { _id: "request-1", status: "rejected" } },
    });
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useRejectPatientAccessRequest(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("request-1");
    });

    expect(api.post).toHaveBeenCalledWith(
      "/patients/me/access-requests/request-1/reject",
    );
    expect(api.post.mock.calls[0]).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["my-patient-access-requests"],
    });
    expect(toast.success).toHaveBeenCalledWith("accessRequests.rejectSuccess");
  });

  test.each([
    [404, useApprovePatientAccessRequest],
    [409, useRejectPatientAccessRequest],
  ])("a stale %s decision shows a safe error and refreshes the inbox", async (status, useHook) => {
    api.post.mockRejectedValueOnce({ response: { status } });
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useHook(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("request-1")).rejects.toBeDefined();
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("accessRequests.noLongerAvailable");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["my-patient-access-requests"],
    });
  });
});

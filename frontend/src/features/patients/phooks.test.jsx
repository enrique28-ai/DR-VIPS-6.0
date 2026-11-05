import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import {
  buildPatientParams,
  useApprovePatientAccessRequest,
  useRequestPatientAccess,
  useCreatePatient,
  useUpdatePatient,
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

import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
const translationState = vi.hoisted(() => ({ language: null }));

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => {
      if (!translationState.language) return fallback ?? key;
      const catalog = translationState.language === "es" ? es : en;
      return key.split(".").reduce((value, part) => value?.[part], catalog) ?? fallback ?? key;
    },
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

describe("useRequestPatientAccess", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test("posts only exact identification in the body and never seeds patient ownership or discovery queries", async () => {
    const body = { mode: "adult", fullname: "Synthetic Patient", email: "patient@example.com" };
    const accepted = { message: "If a matching patient is found, the access request will be available for the patient or authorized guardian to review." };
    api.post.mockResolvedValueOnce({ data: accepted });
    const queryClient = createTestQueryClient();
    const ownedPatients = { items: [], total: 0 };
    queryClient.setQueryData(["patients"], ownedPatients);
    const wrapper = createQueryWrapper(queryClient);
    const { result } = renderHook(() => useRequestPatientAccess(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...body, patientId: "unrelated-id", doctorId: "other-doctor" });
    });
    expect(api.post).toHaveBeenCalledExactlyOnceWith("/patients/access-requests", body);
    expect(api.get).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(["patients"])).toEqual(ownedPatients);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    await waitFor(() => expect(result.current.data).toEqual(accepted));
    expect(toast.success).not.toHaveBeenCalled();
    queryClient.clear();
  });

  test("leaves operational errors to the localized identification form without a raw toast", async () => {
    const error = { response: { status: 500, data: { error: "private backend detail" } } };
    api.post.mockRejectedValueOnce(error);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useRequestPatientAccess(), { wrapper: createQueryWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ mode: "minor", fullname: "Synthetic Minor", email: "guardian@example.com" })).rejects.toBe(error);
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    queryClient.clear();
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

describe("patient create/update conflict messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.language = null;
  });

  const messages = {
    en: {
      reserved: "This email address belongs to a doctor account and cannot be used to register a patient.",
      generic: "The patient information conflicts with an existing record. Please review it and try again.",
    },
    es: {
      reserved: "Este correo electr\u00f3nico pertenece a una cuenta de m\u00e9dico y no puede utilizarse para registrar un paciente.",
      generic: "La informaci\u00f3n del paciente entra en conflicto con un registro existente. Rev\u00edsala e int\u00e9ntalo de nuevo.",
    },
  };
  const conflicts = [
    ["PATIENT_EMAIL_RESERVED", "reserved"],
    ["PATIENT_EMAIL_EXISTS", "conflictEmailExists"],
    ["PATIENT_PHONE_EXISTS", "conflictPhoneExists"],
    ["PENDING_PORTAL", "conflictPendingPortal"],
    ["UNRECOGNIZED_CONFLICT", "generic"],
    ["constructor", "generic"],
    ["__proto__", "generic"],
    [undefined, "generic"],
  ];
  for (const operation of ["create", "update"]) {
    for (const language of ["en", "es"]) {
      test.each(conflicts)(`${operation} in ${language}: %s emits exactly one localized conflict toast`, async (errorCode, message) => {
        translationState.language = language;
        const catalog = language === "es" ? es : en;
        const expected = messages[language][message] ?? catalog.patients.toasts[message];
        const error = { response: { status: 409, data: { errorCode, error: "private backend detail must never appear" } } };
        const method = operation === "create" ? api.post : api.put;
        method.mockRejectedValueOnce(error);
        const queryClient = createTestQueryClient();
        const patient = { _id: "patient-1", fullname: "Synthetic Patient", isDeceased: false };
        const list = { items: [patient], total: 1 };
        queryClient.setQueryData(["patient", patient._id], patient);
        queryClient.setQueryData(["patients", {}], list);
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
        const wrapper = createQueryWrapper(queryClient);
        const { result } = renderHook(() => operation === "create" ? useCreatePatient() : useUpdatePatient(patient._id), { wrapper });
        await act(async () => {
          await expect(result.current.mutateAsync({ isDeceased: true })).rejects.toBe(error);
        });
        expect(toast.error).toHaveBeenCalledExactlyOnceWith(expected);
        expect(toast.success).not.toHaveBeenCalled();
        expect(JSON.stringify(toast.error.mock.calls)).not.toContain("private backend detail");
        expect(queryClient.getQueryData(["patient", patient._id])).toEqual(patient);
        expect(queryClient.getQueryData(["patients", {}])).toEqual(list);
        expect(invalidateSpy).not.toHaveBeenCalled();
        queryClient.clear();
        translationState.language = null;
      });
    }
  }
});

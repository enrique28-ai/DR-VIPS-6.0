import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSessionMutation } from "./useSessionMutation.js";
import { useCreatePatient, useUpdatePatient } from "../features/patients/phooks.js";
import { useCreateDiagnosis } from "../features/diagnostics/dhooks.js";
import { useAuthStore } from "../stores/authStore.js";
import { queryClient } from "./queryClient.js";
import { identityGeneration, invalidateIdentity } from "./authSession.js";
import api from "./axios.js";

vi.mock("./axios.js", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("react-hot-toast", () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { default: toast, toast };
});
vi.mock("../i18n", () => ({ default: { t: key => key } }));

const userA = { _id: "synthetic-doctor-a", role: "doctor", isVerified: true };
const userB = { ...userA, _id: "synthetic-doctor-b" };
const recordA = { _id: "synthetic-record-a", fullname: "Synthetic A" };
const recordB = { _id: "synthetic-record-b", fullname: "Synthetic B" };
const listKey = ["patients", { page: 1 }];
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const Wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const switchToB = async () => {
  api.get.mockResolvedValueOnce({ data: { user: userB } });
  await useAuthStore.getState().checkAuth({ fresh: true });
  queryClient.setQueryData(listKey, { items: [recordB], page: 1, pages: 1 });
};

beforeEach(() => {
  invalidateIdentity();
  queryClient.clear();
  vi.clearAllMocks();
  api.get.mockReset(); api.post.mockReset(); api.put.mockReset();
  useAuthStore.setState({ user: userA, isAuthenticated: true, isCheckingAuth: false, isLoading: false });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });

describe("medical mutation identity ownership", () => {
  test.each(["finalizeGoogleRole", "login"])("failed %s cannot leave A's records available to B", async (action) => {
    api.get.mockResolvedValueOnce({ data: { user: userA } });
    await useAuthStore.getState().checkAuth({ fresh: true });
    const records = [
      [listKey, { items: [recordA] }],
      [["patient", recordA._id], recordA],
      [["diagnosis", "synthetic-diagnosis"], { title: "Synthetic A diagnosis" }],
    ];
    for (const [key, value] of records) queryClient.setQueryData(key, value);
    api.post.mockRejectedValueOnce({ response: { status: 409 } });

    await expect(useAuthStore.getState()[action]("doctor")).rejects.toMatchObject({ response: { status: 409 } });
    expect(useAuthStore.getState().user).toBeNull();
    const retainedAfterFailure = records.map(([key]) => queryClient.getQueryData(key));

    api.get.mockResolvedValueOnce({ data: { user: userB } });
    await useAuthStore.getState().syncSession({ event: new Event("storage") });
    expect(useAuthStore.getState().user).toEqual(userB);
    for (const [key] of records) {
      const readAsB = vi.fn().mockResolvedValue(recordB);
      expect(await queryClient.fetchQuery({ queryKey: key, queryFn: readAsB })).toEqual(recordB);
      expect(readAsB).toHaveBeenCalledOnce();
    }
    expect(retainedAfterFailure).toEqual([undefined, undefined, undefined]);
  });

  test("a late query response from A cannot restore a removed cache entry after B is validated", async () => {
    const response = gate();
    const pending = queryClient.fetchQuery({ queryKey: listKey, queryFn: () => response.promise });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "Error" });
    await switchToB();
    response.resolve({ items: [recordA] });
    await cancelled;
    expect(queryClient.getQueryData(listKey).items).toEqual([recordB]);
  });

  test("a detached create response cannot insert the old patient's detail or list into B's cache", async () => {
    const response = gate(); api.post.mockReturnValueOnce(response.promise);
    const hook = renderHook(() => useCreatePatient(), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ fullname: recordA.fullname }); });
    const failure = expect(operation).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    hook.unmount(); await switchToB();
    await act(async () => { response.resolve({ data: recordA }); await failure; });
    expect(queryClient.getQueryData(["patient", recordA._id])).toBeUndefined();
    expect(queryClient.getQueryData(listKey).items).toEqual([recordB]);
  });

  test("a detached failed update cannot roll back A's snapshots into B's detail or list", async () => {
    queryClient.setQueryData(["patient", recordA._id], recordA);
    queryClient.setQueryData(listKey, { items: [recordA] });
    const response = gate(); api.put.mockReturnValueOnce(response.promise);
    const hook = renderHook(() => useUpdatePatient(recordA._id), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ isDeceased: true }); });
    const failure = expect(operation).rejects.toMatchObject({ response: { status: 500 } });
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    hook.unmount(); await switchToB();
    await act(async () => { response.reject({ response: { status: 500 } }); await failure; });
    expect(queryClient.getQueryData(["patient", recordA._id])).toBeUndefined();
    expect(queryClient.getQueryData(listKey).items).toEqual([recordB]);
  });

  test("a detached failed diagnosis cannot restore the previous identity's diagnosis snapshot", async () => {
    const key = ["diagnoses", recordA._id, {}];
    queryClient.setQueryData(key, { items: [{ _id: "old-diagnosis", title: "Synthetic A diagnosis" }] });
    const response = gate(); api.post.mockReturnValueOnce(response.promise);
    const hook = renderHook(() => useCreateDiagnosis(recordA._id), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ title: "Synthetic addition" }); });
    const failure = expect(operation).rejects.toMatchObject({ response: { status: 500 } });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    hook.unmount(); await switchToB();
    await act(async () => { response.reject({ response: { status: 500 } }); await failure; });
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  test("identity replacement during asynchronous optimistic setup prevents its writes and its API request", async () => {
    const cancel = gate(); vi.spyOn(queryClient, "cancelQueries").mockReturnValueOnce(cancel.promise);
    const key = ["diagnoses", recordA._id, {}]; queryClient.setQueryData(key, { items: [] });
    const hook = renderHook(() => useCreateDiagnosis(recordA._id), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ title: "Synthetic addition" }); });
    const failure = expect(operation).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    await waitFor(() => expect(queryClient.cancelQueries).toHaveBeenCalled());
    await switchToB();
    await act(async () => { cancel.resolve(); await failure; });
    expect(api.post).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  test("same-identity authoritative validation does not discard a legitimate pending create", async () => {
    const response = gate(), validation = gate();
    api.post.mockReturnValueOnce(response.promise); api.get.mockReturnValueOnce(validation.promise);
    const hook = renderHook(() => useCreatePatient(), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ fullname: recordA.fullname }); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const generation = identityGeneration();
    let check;
    act(() => { check = useAuthStore.getState().syncSession({ event: new Event("focus") }); });
    await act(async () => { validation.resolve({ data: { user: userA } }); await check; });
    expect(identityGeneration()).toBe(generation);
    await act(async () => { response.resolve({ data: recordA }); await operation; });
    expect(queryClient.getQueryData(["patient", recordA._id])).toEqual(recordA);
  });

  test.each([false, true])("a new request waits for validation and only sends for the same identity, replaced=%s", async (replace) => {
    const validation = gate(); api.get.mockReturnValueOnce(validation.promise);
    api.post.mockResolvedValueOnce({ data: recordA });
    let check;
    act(() => { check = useAuthStore.getState().syncSession({ event: new Event("focus") }); });
    const hook = renderHook(() => useCreatePatient(), { wrapper: Wrapper });
    const payload = { fullname: recordA.fullname };
    let operation;
    act(() => { operation = hook.result.current.mutateAsync(payload); });
    const observed = replace ? expect(operation).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" }) : operation;
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => { validation.resolve({ data: { user: replace ? userB : userA } }); await check; await observed; });
    if (replace) expect(api.post).not.toHaveBeenCalled();
    else expect(api.post).toHaveBeenCalledExactlyOnceWith("/patients", payload);
  });

  test("a second validation starting as the first resolves keeps medical requests blocked", async () => {
    const first = gate(), second = gate();
    api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let initial;
    act(() => { initial = useAuthStore.getState().syncSession({ event: new Event("focus") }); });
    const hook = renderHook(() => useCreatePatient(), { wrapper: Wrapper });
    let operation;
    act(() => { operation = hook.result.current.mutateAsync({ fullname: recordA.fullname }); });
    const failure = expect(operation).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    let next;
    const unsubscribe = useAuthStore.subscribe(state => {
      if (!state.isCheckingAuth && !next) next = useAuthStore.getState().syncSession({ event: new Event("storage") });
    });
    await act(async () => { first.resolve({ data: { user: userA } }); await initial; });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.post).not.toHaveBeenCalled();
    unsubscribe();
    await act(async () => { second.resolve({ data: { user: userB } }); await next; await failure; });
    expect(api.post).not.toHaveBeenCalled();
  });

  test("per-call callbacks and public variables retain their original contracts", async () => {
    const variables = { synthetic: true }, context = { snapshot: "synthetic" }, callbacks = { onSuccess: vi.fn(), onSettled: vi.fn() };
    const mutationFn = vi.fn().mockResolvedValue("done"), success = vi.fn();
    const hook = renderHook(() => useSessionMutation({ mutationFn, onMutate: () => context, onSuccess: success }), { wrapper: Wrapper });
    await act(async () => { await hook.result.current.mutateAsync(variables, callbacks); });
    expect(mutationFn).toHaveBeenCalledWith(variables, expect.any(Object));
    expect(success).toHaveBeenCalledWith("done", variables, context, expect.any(Object));
    expect(callbacks.onSuccess).toHaveBeenCalledWith("done", variables, context, expect.any(Object));
    expect(callbacks.onSettled).toHaveBeenCalledWith("done", null, variables, context, expect.any(Object));
    await waitFor(() => expect(hook.result.current.variables).toBe(variables));
  });
});

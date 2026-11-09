import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const medicalProbe = vi.hoisted(() => ({ enabled: false, load: vi.fn() }));
vi.mock("./lib/axios.js", () => ({ default: api }));
vi.mock("./components/Navbar.jsx", () => ({ default: function MockNavbar() {
  const navigate = useNavigate();
  return <nav><Link to="/patients">Patients link</Link><Link to="/calendar">Calendar link</Link><Link to="/">Home link</Link><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></nav>;
} }));
vi.mock("./components/layout/Sidebar.jsx", () => ({ default: () => null }));
vi.mock("./pages/Home.jsx", () => ({ default: () => <h1>Home</h1> }));
vi.mock("./pages/registration/LoginPage.jsx", () => ({ default: () => <h1>Login</h1> }));
vi.mock("./pages/registration/SignUpPage.jsx", () => ({ default: () => <h1>Signup</h1> }));
vi.mock("./pages/registration/ForgotPasswordPage.jsx", () => ({ default: () => null }));
vi.mock("./pages/registration/ResetPasswordPage.jsx", () => ({ default: () => null }));
vi.mock("./pages/registration/EmailVerificationPage.jsx", () => ({ default: () => <h1>Verify email</h1> }));
vi.mock("./pages/registration/EligibilityInfoPage.jsx", () => ({ default: () => null }));
vi.mock("./pages/registration/ChooseRole.jsx", () => ({ default: () => null }));
vi.mock("./pages/patientsrecord/PatientsPage.jsx", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return { default: function MockPatients() {
    const { data } = useQuery({
      queryKey: ["patients", { page: 1 }],
      queryFn: medicalProbe.load,
      enabled: medicalProbe.enabled,
    });
    return <><h1>Patients</h1>{medicalProbe.enabled && data?.items?.map((item) => <p key={item._id}>{item.label}</p>)}</>;
  } };
});
vi.mock("./pages/calendar/CalendarPage.jsx", () => ({ default: () => <h1>Calendar</h1> }));
vi.mock("./pages/docrecords/MyHealthState.jsx", () => ({ default: () => <h1>Patient portal</h1> }));
vi.mock("./pages/docrecords/PatientAccessRequestsPage.jsx", () => ({ default: () => <h1>Access requests</h1> }));
function DraftEditor() {
  const [draft, setDraft] = useState("");
  return <label>Unsaved draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>;
}
vi.mock("./pages/patientsrecord/PatientEditPage.jsx", () => ({ default: DraftEditor }));
vi.mock("./pages/diagnosisrecord/DiagnosisEditPage.jsx", () => ({ default: DraftEditor }));
const user = { _id: "synthetic-doctor", role: "doctor", isVerified: true };
const response = (value = user) => ({ data: { user: value } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let store;
let queryClient;
async function start(path = "/patients", { persisted, strict = false } = {}) {
  window.history.replaceState({}, "", path);
  if (persisted) localStorage.setItem("drvips-auth", JSON.stringify({ state: { user: persisted, isAuthenticated: true }, version: 0 }));
  store = (await import("./stores/authStore.js")).useAuthStore;
  queryClient = (await import("./lib/queryClient.js")).queryClient;
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { default: i18n } = await import("./i18n.js"); await i18n.changeLanguage("en");
  const { default: App } = await import("./App.jsx");
  const tree = <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
beforeEach(() => {
  vi.resetModules(); api.get.mockReset(); api.post.mockReset(); localStorage.clear(); sessionStorage.clear();
  medicalProbe.enabled = false; medicalProbe.load.mockReset().mockResolvedValue({ items: [] });
  api.get.mockResolvedValue(response());
});
afterEach(() => { cleanup(); queryClient?.clear(); });
describe("App bootstrap with real auth store and guards", () => {
  test("same-account synchronization restarts an interrupted first medical read on the mounted page", async () => {
    medicalProbe.enabled = true;
    const cancelledRead = deferred(), check = deferred();
    medicalProbe.load.mockReturnValueOnce(cancelledRead.promise)
      .mockResolvedValueOnce({ items: [{ _id: "synthetic-record", label: "Authorized medical result" }] });
    await start();
    const heading = await screen.findByRole("heading", { name: "Patients" });
    await waitFor(() => expect(medicalProbe.load).toHaveBeenCalledTimes(1));
    api.get.mockReturnValueOnce(check.promise);
    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(heading).not.toBeVisible();
    expect(medicalProbe.load).toHaveBeenCalledTimes(1);
    await act(async () => check.resolve(response()));
    await screen.findByText("Authorized medical result");
    await act(async () => cancelledRead.resolve({ items: [] }));
    expect(medicalProbe.load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Patients" })).toBe(heading);
    expect(screen.getByText("Authorized medical result")).toBeVisible();
  });

  test.each(["/patients/synthetic/edit", "/diagnosis/patient/synthetic/diagnosis/edit"])("keeps the same draft editor through focus and BFCache on %s", async (path) => {
    await start(path);
    const editor = await screen.findByRole("textbox", { name: "Unsaved draft" });
    fireEvent.change(editor, { target: { value: "Synthetic unsaved edit" } });

    const gate = deferred();
    api.get.mockReturnValueOnce(gate.promise);
    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(editor).toBeInTheDocument();
    expect(editor).not.toBeVisible();
    expect(editor.closest("[inert]")).not.toBeNull();
    await act(async () => gate.resolve(response()));
    expect(screen.getByRole("textbox", { name: "Unsaved draft" })).toBe(editor);
    expect(editor).toHaveValue("Synthetic unsaved edit");

    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(editor).not.toBeVisible();
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    await act(async () => window.dispatchEvent(restored));
    expect(screen.getByRole("textbox", { name: "Unsaved draft" })).toBe(editor);
    expect(editor).toHaveValue("Synthetic unsaved edit");
    expect(api.post).not.toHaveBeenCalled();

    api.get.mockResolvedValueOnce(response({ ...user, _id: "synthetic-replacement" }));
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "drvips-session-change", newValue: "replacement" })));
    expect(editor).not.toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Unsaved draft" })).toHaveValue("");
  });

  test("guardian restoration discards cached diagnosis and fetches again for the still-authenticated guardian", async () => {
    const guardian = { ...user, role: "patient" };
    const apiPath = "/diagnoses/children/synthetic-child/mine/synthetic-diagnosis";
    let revoked = false;
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") return Promise.resolve(response(guardian));
      if (path !== apiPath) throw new Error("Unexpected synthetic API request");
      return revoked ? Promise.reject({ response: { status: 403 } }) : Promise.resolve({ data: { title: "Synthetic child diagnosis" } });
    });
    await start("/docrecords/mychildren/synthetic-child/health-state/synthetic-diagnosis");
    await screen.findByRole("heading", { name: "Synthetic child diagnosis" });
    act(() => window.dispatchEvent(new Event("pagehide")));
    revoked = true;
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    await act(async () => window.dispatchEvent(restored));
    await waitFor(() => expect(api.get.mock.calls.filter(([path]) => path === apiPath)).toHaveLength(2));
    expect(screen.queryByText("Synthetic child diagnosis")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["child-diagnosis", "synthetic-child", "synthetic-diagnosis"])).toBeUndefined();
    expect(store.getState().user).toEqual(guardian);
  });

  test.each([
    ["/calendar", "Calendar", "appointments"],
    ["/docrecords/access-requests", "Access requests", "my-patient-access-requests"],
  ])("guardian restoration discards prior cached data and local view state on %s", async (path, heading, key) => {
    api.get.mockResolvedValue(response({ ...user, role: "patient" }));
    await start(path);
    const oldView = await screen.findByRole("heading", { name: heading });
    queryClient.setQueryData([key], { label: "Synthetic guardian data before revocation" });
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(oldView).not.toBeInTheDocument();
    const restored = Object.assign(new Event("pageshow"), { persisted: true });
    await act(async () => window.dispatchEvent(restored));
    expect(await screen.findByRole("heading", { name: heading })).not.toBe(oldView);
    expect(queryClient.getQueryData([key])).toBeUndefined();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("restoring a public page also removes cached data from earlier guardian navigation", async () => {
    api.get.mockResolvedValue(response({ ...user, role: "patient" }));
    await start("/");
    await waitFor(() => expect(store.getState().isAuthenticated).toBe(true));
    const guardianKey = ["child-diagnosis", "synthetic-child", "synthetic-diagnosis"];
    queryClient.setQueryData(guardianKey, { title: "Former guardian record" });
    queryClient.setQueryData(["myHealthInfo"], { name: "Current account record" });
    const restored = Object.assign(new Event("pageshow"), { persisted: true });
    await act(async () => window.dispatchEvent(restored));
    expect(queryClient.getQueryData(guardianKey)).toBeUndefined();
    expect(queryClient.getQueryData(["myHealthInfo"])).toEqual({ name: "Current account record" });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test.each(["activation-first", "pageshow-first"])("a BFCache return shares one settled round across %s events", async (order) => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      act(() => {
        window.dispatchEvent(new Event("blur"));
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("pagehide"));
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      const gate = deferred();
      api.get.mockReturnValueOnce(gate.promise);
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      act(() => {
        visibility.mockReturnValue("visible");
        if (order === "activation-first") document.dispatchEvent(new Event("visibilitychange"));
        else window.dispatchEvent(event);
      });
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      await act(async () => gate.resolve(response()));
      if (order === "activation-first") expect(screen.queryByRole("heading", { name: "Patients" })).toBeNull();
      act(() => {
        if (order === "activation-first") window.dispatchEvent(event);
        else document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {});
      expect(api.get).toHaveBeenCalledTimes(2);
      await screen.findByRole("heading", { name: "Patients" });
    } finally {
      visibility.mockRestore();
    }
  });

  test("a hidden BFCache restoration preserves a later activation check for a missed account change", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      act(() => {
        window.dispatchEvent(new Event("blur"));
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("pagehide"));
        const event = new Event("pageshow");
        Object.defineProperty(event, "persisted", { value: true });
        window.dispatchEvent(event);
      });
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      await screen.findByRole("heading", { name: "Patients" });
      api.get.mockResolvedValue(response({ ...user, _id: "synthetic-background-replacement-b" }));
      act(() => {
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      await waitFor(() => expect(store.getState().user._id).toBe("synthetic-background-replacement-b"));
      expect(api.get).toHaveBeenCalledTimes(3);
    } finally {
      visibility.mockRestore();
    }
  });

  test("StrictMode announces an authoritative redirect startup once, installs one observer and removes it on unmount", async () => {
    const written = vi.spyOn(Storage.prototype, "setItem");
    try {
      api.get.mockResolvedValue(response({ ...user, _id: "synthetic-oauth-redirect-b" }));
      await start("/patients", { persisted: user, strict: true });
      await screen.findByRole("heading", { name: "Patients" });
      expect(store.getState().user._id).toBe("synthetic-oauth-redirect-b");
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(written.mock.calls.filter(([key]) => key === "drvips-session-change")).toHaveLength(1);
      act(() => window.dispatchEvent(new StorageEvent("storage", { key: "drvips-session-change", newValue: "synthetic-peer" })));
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      await act(async () => {});
      expect(written.mock.calls.filter(([key]) => key === "drvips-session-change")).toHaveLength(1);
      cleanup();
      act(() => window.dispatchEvent(new StorageEvent("storage", { key: "drvips-session-change", newValue: "synthetic-after-unmount" })));
      await act(async () => {});
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      written.mockRestore();
    }
  });

  test("a guest auth form stays usable while a missed OAuth session is being synchronized", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 401 } });
    await start("/login");
    await screen.findByRole("heading", { name: "Login" });
    const gate = deferred();
    const replacement = { ...user, _id: "synthetic-oauth-b" };
    api.get.mockReturnValueOnce(gate.promise).mockResolvedValue(response(replacement));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "drvips-session-change", newValue: "synthetic-oauth-hint" })));
    expect(store.getState().isCheckingAuth).toBe(true);
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response(replacement)));
    await screen.findByRole("heading", { name: "Patients" });
    expect(store.getState().user._id).toBe("synthetic-oauth-b");
  });

  test("a session-change notification hides cached medical data until another account is validated without echoing", async () => {
    medicalProbe.enabled = true;
    const initial = deferred(), changed = deferred();
    api.get.mockReturnValueOnce(initial.promise).mockReturnValueOnce(changed.promise);
    await start();
    queryClient.setQueryData(["patients", { page: 1 }], {
      items: [{ _id: "synthetic-a", label: "Synthetic tab A medical data" }],
    });
    await act(async () => initial.resolve(response()));
    await screen.findByText("Synthetic tab A medical data");
    const previousAnnouncement = localStorage.getItem("drvips-session-change");
    const event = new StorageEvent("storage", { key: "drvips-session-change", newValue: "synthetic-peer-notification" });
    act(() => window.dispatchEvent(event));
    expect(store.getState().isCheckingAuth).toBe(true);
    expect(screen.getByText("Synthetic tab A medical data")).not.toBeVisible();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await act(async () => changed.resolve(response({ ...user, _id: "synthetic-tab-b" })));
    await screen.findByRole("heading", { name: "Patients" });
    expect(store.getState().user._id).toBe("synthetic-tab-b");
    expect(screen.queryByText("Synthetic tab A medical data")).not.toBeInTheDocument();
    expect(localStorage.getItem("drvips-session-change")).toBe(previousAnnouncement);
  });

  test("returning to a tab recovers a missed session change with one visible/focus validation even if it settles between events", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      act(() => {
        window.dispatchEvent(new Event("blur"));
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      api.get.mockResolvedValue(response({ ...user, _id: "synthetic-returned-b" }));
      act(() => {
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitFor(() => expect(store.getState().user._id).toBe("synthetic-returned-b"));
      act(() => window.dispatchEvent(new Event("focus")));
      await act(async () => {});
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
    }
  });

  test.each([false, true])("direct protected startup makes exactly one authoritative request, StrictMode=%s", async (strict) => {
    const gate = deferred(); api.get.mockReturnValue(gate.promise);
    await start("/patients", { persisted: user, strict });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response()));
    await screen.findByRole("heading", { name: "Patients" });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  test.each([false, true])("hydrated account replacement shares exactly one startup request, StrictMode=%s", async (strict) => {
    medicalProbe.enabled = true;
    const gate = deferred();
    api.get.mockReturnValueOnce(gate.promise);
    await start("/patients", { persisted: user, strict });
    queryClient.setQueryData(["patients", { page: 1 }], {
      items: [{ _id: "synthetic-a", label: "Synthetic hydrated account A" }],
    });
    expect(screen.queryByText("Synthetic hydrated account A")).not.toBeInTheDocument();
    await act(async () => gate.resolve(response({ ...user, _id: "synthetic-startup-b" })));
    await screen.findByRole("heading", { name: "Patients" });
    expect(store.getState().user._id).toBe("synthetic-startup-b");
    expect(screen.queryByText("Synthetic hydrated account A")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  test("guest startup rejection stays handled and redirects to login", async () => {
    api.get.mockRejectedValue({ response: { status: 401 } });
    await start(); await screen.findByRole("heading", { name: "Login" });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  test.each(["/login", "/signup"])("guest %s form remains usable while bootstrap is pending", async (path) => {
    api.get.mockReturnValue(deferred().promise);
    await start(path); await screen.findByRole("heading", { name: path === "/login" ? "Login" : "Signup" });
    expect(store.getState().isCheckingAuth).toBe(true);
  });
  test("hydrated auth-only redirect waits for validation", async () => {
    const gate = deferred(); api.get.mockReturnValueOnce(gate.promise);
    await start("/login", { persisted: user });
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.reject({ response: { status: 401 } }));
    await screen.findByRole("heading", { name: "Login" });
  });
  test.each([[{ ...user, isVerified: false }, "Verify email"], [{ ...user, role: "patient" }, "Patient portal"]])("retains verification and role redirects", async (value, heading) => {
    api.get.mockResolvedValue(response(value));
    await start(); await screen.findByRole("heading", { name: heading });
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
  });
  test("navigation and return from a public page require fresh rounds", async () => {
    await start(); await screen.findByRole("heading", { name: "Patients" });
    fireEvent.click(screen.getByRole("link", { name: "Home link" }));
    await screen.findByRole("heading", { name: "Home" });
    const gate = deferred(); api.get.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response()));
    await screen.findByRole("heading", { name: "Patients" });
  });
  test("rapid protected navigation stays blocked until its current round resolves", async () => {
    await start(); await screen.findByRole("heading", { name: "Patients" });
    const gate = deferred(); api.get.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole("link", { name: "Calendar link" }));
    expect(screen.queryByRole("heading", { name: "Calendar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Patients link" }));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response()));
    await screen.findByRole("heading", { name: "Patients" });
  });
  test("persisted pageshow supersedes pre-freeze validation", async () => {
    const old = deferred(), restored = deferred();
    api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(restored.promise);
    await start("/patients", { persisted: user });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(response()));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => restored.reject({ response: { status: 401 } }));
    await screen.findByRole("heading", { name: "Login" });
  });

  test("restoring a different server identity cannot render the previous identity's cached medical list", async () => {
    medicalProbe.enabled = true;
    const initial = deferred(), restored = deferred();
    api.get.mockReturnValueOnce(initial.promise).mockReturnValueOnce(restored.promise);
    await start();
    queryClient.setQueryData(["patients", { page: 1 }], {
      items: [{ _id: "synthetic-record-a", label: "Synthetic medical information A" }],
    });
    await act(async () => initial.resolve(response()));
    await screen.findByText("Synthetic medical information A");
    const { identityGeneration, isCurrentIdentity } = await import("./lib/authSession.js");
    const previousIdentity = identityGeneration();
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    expect(screen.getByText("Synthetic medical information A")).not.toBeVisible();
    await act(async () => restored.resolve(response({ ...user, _id: "synthetic-doctor-b" })));
    await screen.findByRole("heading", { name: "Patients" });
    expect(store.getState().user._id).toBe("synthetic-doctor-b");
    expect(screen.queryByText("Synthetic medical information A")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["patients", { page: 1 }])?.items).not.toEqual([
      { _id: "synthetic-record-a", label: "Synthetic medical information A" },
    ]);
    expect(isCurrentIdentity(previousIdentity)).toBe(false);
    expect(identityGeneration()).toBeGreaterThan(previousIdentity);
  });

  test("a server role change on restoration fences the former role and its cached records", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    queryClient.setQueryData(["patients", { page: 1 }], { items: [{ _id: "synthetic-doctor-record" }] });
    const { identityGeneration, isCurrentIdentity } = await import("./lib/authSession.js");
    const previousIdentity = identityGeneration();
    const patient = { ...user, role: "patient" };
    api.get.mockResolvedValue(response(patient));
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    await screen.findByRole("heading", { name: "Patient portal" });
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["patients", { page: 1 }])).toBeUndefined();
    expect(isCurrentIdentity(previousIdentity)).toBe(false);
  });

  test("logout clears medical cache and Back cannot reopen the protected page", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    queryClient.setQueryData(["patients", { page: 1 }], { items: [{ _id: "synthetic-a" }] });
    fireEvent.click(screen.getByRole("link", { name: "Calendar link" }));
    await screen.findByRole("heading", { name: "Calendar" });
    api.post.mockResolvedValueOnce({ data: { success: true } });
    api.get.mockRejectedValue({ response: { status: 401 } });
    await act(async () => store.getState().logout());
    await screen.findByRole("heading", { name: "Login" });
    expect(queryClient.getQueryData(["patients", { page: 1 }])).toBeUndefined();
    const beforeBack = api.get.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(beforeBack));
    await screen.findByRole("heading", { name: "Login" });
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Calendar" })).not.toBeInTheDocument();
  });

  test.each([401, 500, "network"])("a restored session failing with %s stays closed", async (status) => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const restored = deferred();
    api.get.mockReturnValueOnce(restored.promise);
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => restored.reject(status === "network" ? new Error("Synthetic network failure") : { response: { status } }));
    await screen.findByRole("heading", { name: "Login" });
    expect(store.getState().isAuthenticated).toBe(false);
  });

  test("failed restoration removes cached records before a later different identity can authenticate", async () => {
    medicalProbe.enabled = true;
    const initial = deferred();
    api.get.mockReturnValueOnce(initial.promise);
    await start();
    queryClient.setQueryData(["patients", { page: 1 }], {
      items: [{ _id: "synthetic-a", label: "Synthetic information before failed restore" }],
    });
    await act(async () => initial.resolve(response()));
    await screen.findByText("Synthetic information before failed restore");
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    await screen.findByRole("heading", { name: "Login" });
    expect(store.getState().user).toBeNull();
    expect(queryClient.getQueryData(["patients", { page: 1 }])).toBeUndefined();
    api.get.mockResolvedValue(response({ ...user, _id: "synthetic-after-failure-b" }));
    fireEvent.click(screen.getByRole("link", { name: "Patients link" }));
    await screen.findByRole("heading", { name: "Patients" });
    expect(store.getState().user._id).toBe("synthetic-after-failure-b");
    expect(screen.queryByText("Synthetic information before failed restore")).not.toBeInTheDocument();
  });

  test("successful restoration waits for the fresh round before reopening the same permitted route", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const restored = deferred();
    api.get.mockReturnValueOnce(restored.promise);
    const beforeRestore = api.get.mock.calls.length;
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(beforeRestore + 1));
    await act(async () => restored.resolve(response()));
    await screen.findByRole("heading", { name: "Patients" });
    expect(api.get).toHaveBeenCalledTimes(beforeRestore + 1);
  });

  test("a delayed restore success cannot restore auth or cache after logout", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    const restored = deferred();
    api.get.mockReturnValueOnce(restored.promise);
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    act(() => window.dispatchEvent(event));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    api.post.mockResolvedValueOnce({ data: { success: true } });
    await act(async () => store.getState().logout());
    expect(store.getState().isAuthenticated).toBe(false);
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => restored.resolve(response()));
    await screen.findByRole("heading", { name: "Login" });
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().user).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
  });

  test("rapid Back and Forward cannot reopen content while the current validation is pending", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    fireEvent.click(screen.getByRole("link", { name: "Calendar link" }));
    await screen.findByRole("heading", { name: "Calendar" });
    const gate = deferred();
    api.get.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.queryByRole("heading", { name: "Calendar" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response()));
    await screen.findByRole("heading", { name: "Calendar" });
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  test("a doctor cannot enter the patient-only portal", async () => {
    await start("/docrecords/myhealthstate");
    await screen.findByRole("heading", { name: "Patients" });
    expect(screen.queryByRole("heading", { name: "Patient portal" })).not.toBeInTheDocument();
  });

  test("an explicit account switch clears the previous medical cache", async () => {
    await start();
    await screen.findByRole("heading", { name: "Patients" });
    queryClient.setQueryData(["patients", { page: 1 }], { items: [{ _id: "synthetic-a" }] });
    api.post.mockResolvedValueOnce({ data: { success: true } });
    api.get.mockResolvedValue(response({ ...user, _id: "synthetic-patient-b", role: "patient" }));
    await act(async () => store.getState().login("synthetic@example.com", "synthetic-credential"));
    await screen.findByRole("heading", { name: "Patient portal" });
    expect(queryClient.getQueryData(["patients", { page: 1 }])).toBeUndefined();
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
  });
  test("navigation during failed verification cannot authorize from preserved user", async () => {
    await start(); await screen.findByRole("heading", { name: "Patients" });
    const mutation = deferred(), validation = deferred();
    api.post.mockReturnValueOnce(mutation.promise);
    let operation;
    act(() => { operation = store.getState().verifyEmail("synthetic"); });
    const failed = expect(operation).rejects.toMatchObject({ response: { status: 400 } });
    api.get.mockReturnValueOnce(validation.promise);
    fireEvent.click(screen.getByRole("link", { name: "Calendar link" }));
    expect(screen.queryByRole("heading", { name: "Calendar" })).not.toBeInTheDocument();
    await act(async () => { mutation.reject({ response: { status: 400 } }); await failed; });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: "Calendar" })).not.toBeInTheDocument();
    await act(async () => validation.reject({ response: { status: 401 } }));
    await screen.findByRole("heading", { name: "Login" });
  });

});

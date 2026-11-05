import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => ({ auth: {}, imports: vi.fn(), renders: vi.fn(), patientGet: vi.fn() }));
vi.mock("./lib/axios.js", () => ({ default: { get: fixture.patientGet } }));
vi.mock("./stores/authStore.js", () => ({
  useAuthStore: Object.assign(
    (selector) => selector ? selector(fixture.auth) : fixture.auth,
    { getState: () => fixture.auth },
  ),
}));
vi.mock("./components/Navbar.jsx", () => ({
  default: ({ onToggleNavigation }) => (
    <nav aria-label="Test navigation">
      <button onClick={onToggleNavigation}>Toggle navigation</button>
      <Link to="/patients">Patients link</Link>
      <Link to="/calendar">Calendar link</Link>
      <Link to="/profile">Profile link</Link>
    </nav>
  ),
}));
vi.mock("./components/layout/Sidebar.jsx", () => ({
  default: ({ open }) => open ? <aside>Test sidebar</aside> : null,
}));
vi.mock("./pages/Home.jsx", () => ({ default: () => <h1>Home</h1> }));
vi.mock("./pages/registration/LoginPage.jsx", () => ({ default: () => <h1>Login</h1> }));
vi.mock("./pages/registration/SignUpPage.jsx", () => ({ default: () => <h1>Signup</h1> }));
vi.mock("./pages/registration/ForgotPasswordPage.jsx", () => ({ default: () => <h1>Forgot password</h1> }));
vi.mock("./pages/registration/ResetPasswordPage.jsx", () => ({ default: () => <h1>Reset password</h1> }));
vi.mock("./pages/registration/EmailVerificationPage.jsx", () => ({ default: () => <h1>Verify email</h1> }));
vi.mock("./pages/registration/EligibilityInfoPage.jsx", () => ({ default: () => <h1>Eligibility</h1> }));
vi.mock("./pages/registration/ChooseRole.jsx", () => ({ default: () => <h1>Choose role</h1> }));

const routes = [
  ["PatientsPage", "patientsrecord", "/patients", "doctor", {}],
  ["PatientCreatePage", "patientsrecord", "/patients/new", "doctor", {}],
  ["PatientDetailPage", "patientsrecord", "/patients/patient-1", "doctor", { id: "patient-1" }],
  ["PatientEditPage", "patientsrecord", "/patients/patient-1/edit", "doctor", { id: "patient-1" }],
  ["SearchGlobalPatient", "patientsrecord", "/patients/search", "doctor", {}],
  ["DiagnosesByPatientPage", "diagnosisrecord", "/diagnosis/patient/patient-1", "doctor", { patientId: "patient-1" }],
  ["DiagnosisCreatePage", "diagnosisrecord", "/diagnosis/patient/patient-1/new", "doctor", { patientId: "patient-1" }],
  ["DiagnosisDetailPage", "diagnosisrecord", "/diagnosis/patient/patient-1/diagnosis-1", "doctor", { patientId: "patient-1", diagnosisId: "diagnosis-1" }],
  ["DiagnosisEditPage", "diagnosisrecord", "/diagnosis/patient/patient-1/diagnosis-1/edit", "doctor", { patientId: "patient-1", diagnosisId: "diagnosis-1" }],
  ["MyHealthState", "docrecords", "/docrecords/myhealthstate", "patient", {}],
  ["MyHealthStateDetail", "docrecords", "/docrecords/myhealthstate/diagnosis-1", "patient", { id: "diagnosis-1" }],
  ["MyHealthInfo", "docrecords", "/docrecords/myhealthinfo", "patient", {}],
  ["PatientAccessRequestsPage", "docrecords", "/docrecords/access-requests", "patient", {}],
  ["MyChildrenHome", "docrecords", "/docrecords/mychildren", "patient", {}],
  ["MyChildHealthInfo", "docrecords", "/docrecords/mychildren/child-1/health-info", "patient", { childId: "child-1" }],
  ["MyChildHealthState", "docrecords", "/docrecords/mychildren/child-1/health-state", "patient", { childId: "child-1" }],
  ["MyChildHealthStateDetail", "docrecords", "/docrecords/mychildren/child-1/health-state/diagnosis-1", "patient", { childId: "child-1", id: "diagnosis-1" }],
  ["CalendarPage", "calendar", "/calendar", "doctor", {}],
  ["ProfilePage", "registration", "/profile", "patient", {}],
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let chunkGates;
function mockPage(name, folder) {
  vi.doMock(`./pages/${folder}/${name}.jsx`, async () => {
    fixture.imports(name);
    if (chunkGates[name]) await chunkGates[name].promise;
    return {
      default: function MockPage() {
        fixture.renders(name);
        const params = useParams();
        return <><h1>{name}</h1><div data-testid="params">{JSON.stringify(params)}</div></>;
      },
    };
  });
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  return <>
    <div data-testid="location">{location.pathname}{location.search}{location.hash}</div>
    <div data-testid="navigation-type">{navigationType}</div>
    <button onClick={() => navigate(-1)}>History back</button>
  </>;
}

async function renderApp(path, initialEntries = [path]) {
  const { default: i18n } = await import("./i18n.js");
  await i18n.changeLanguage("en");
  const { default: App } = await import("./App.jsx");
  return render(<MemoryRouter initialEntries={initialEntries}><App /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  chunkGates = {};
  fixture.auth = {
    user: { role: "doctor", isVerified: true },
    isAuthenticated: true,
    isCheckingAuth: false,
    checkAuth: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  };
  for (const [name, folder] of routes) mockPage(name, folder);
});
afterEach(() => vi.restoreAllMocks());

describe("protected lazy routes with real guards", () => {
  test("legacy preview replaces its URL with identification, discards identity parameters and loads only the destination", async () => {
    const legacyUrl = "/patients/global/private-patient-id?email=private%40example.com#private-fragment";
    chunkGates.SearchGlobalPatient = deferred();
    await renderApp(legacyUrl, ["/", legacyUrl]);
    await screen.findByRole("status");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/patients\/search$/);
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
    expect(fixture.imports.mock.calls).toEqual([["SearchGlobalPatient"]]);
    expect(fixture.patientGet).not.toHaveBeenCalled();
    await act(async () => chunkGates.SearchGlobalPatient.resolve());
    await screen.findByRole("heading", { name: "SearchGlobalPatient" });
    expect(JSON.parse(screen.getByTestId("params").textContent)).toEqual({});
    expect(fixture.renders).not.toHaveBeenCalledWith("GlobalPatientDetailPage");
    expect(fixture.patientGet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await screen.findByRole("heading", { name: "Home" });
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
    expect(fixture.imports.mock.calls).toEqual([["SearchGlobalPatient"]]);
  });

  test.each([
    ["guest", null, false, "/login", "Login"],
    ["unverified doctor", { role: "doctor", isVerified: false }, true, "/verify-email", "Verify email"],
    ["patient role", { role: "patient", isVerified: true }, true, "/docrecords/myhealthstate", "MyHealthState"],
  ])("legacy preview keeps the %s guard ahead of identification", async (_case, user, authenticated, target, heading) => {
    fixture.auth.user = user;
    fixture.auth.isAuthenticated = authenticated;
    await renderApp("/patients/global/private-patient-id?email=private%40example.com");
    await screen.findByRole("heading", { name: heading });
    expect(screen.getByTestId("location")).toHaveTextContent(target);
    expect(fixture.imports).not.toHaveBeenCalledWith("SearchGlobalPatient");
    expect(fixture.renders).not.toHaveBeenCalledWith("SearchGlobalPatient");
    expect(fixture.patientGet).not.toHaveBeenCalled();
  });

  test("legacy preview waits for auth before replacing the URL or loading identification", async () => {
    const auth = deferred();
    fixture.auth.isCheckingAuth = true;
    fixture.auth.checkAuth.mockReturnValue(auth.promise);
    const legacyUrl = "/patients/global/private-patient-id?email=private%40example.com";
    await renderApp(legacyUrl);
    expect(screen.getByTestId("location")).toHaveTextContent(legacyUrl);
    expect(fixture.imports).not.toHaveBeenCalled();
    expect(fixture.renders).not.toHaveBeenCalled();
    expect(fixture.patientGet).not.toHaveBeenCalled();
    fixture.auth.isCheckingAuth = false;
    await act(async () => auth.resolve());
    await screen.findByRole("heading", { name: "SearchGlobalPatient" });
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/patients\/search$/);
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
    expect(fixture.imports.mock.calls).toEqual([["SearchGlobalPatient"]]);
    expect(fixture.patientGet).not.toHaveBeenCalled();
  });

  test("App starts auth before a protected chunk loads and keeps the shell during loading", async () => {
    const auth = deferred();
    fixture.auth.checkAuth.mockReturnValue(auth.promise);
    chunkGates.PatientsPage = deferred();
    const { container } = await renderApp("/patients");
    const navbar = screen.getByRole("navigation");
    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const sidebar = container.querySelector("aside");
    expect(sidebar).not.toBeNull();
    expect(fixture.auth.checkAuth).toHaveBeenCalled();
    expect(fixture.imports).not.toHaveBeenCalled();
    expect(fixture.renders).not.toHaveBeenCalled();
    await act(async () => auth.resolve());
    expect(await screen.findByRole("status")).toHaveTextContent("Loading...");
    expect(fixture.imports).toHaveBeenCalledWith("PatientsPage");
    expect(fixture.renders).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
    await act(async () => chunkGates.PatientsPage.resolve());
    expect(await screen.findByRole("heading", { name: "PatientsPage" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
  });

  test.each(["/", "/login", "/signup"])("public %s mounts without requesting a protected chunk", async (path) => {
    fixture.auth.isAuthenticated = false;
    fixture.auth.user = null;
    await renderApp(path);
    await screen.findByRole("heading");
    expect(fixture.auth.checkAuth).toHaveBeenCalled();
    expect(fixture.imports).not.toHaveBeenCalled();
  });

  test.each([
    ["guest", null, false, "/patients", "/login", "Login"],
    ["unverified", { role: "doctor", isVerified: false }, true, "/patients", "/verify-email", "Verify email"],
    ["wrong doctor role", { role: "doctor", isVerified: true }, true, "/docrecords/access-requests", "/patients", "PatientsPage"],
    ["wrong patient role", { role: "patient", isVerified: true }, true, "/patients", "/docrecords/myhealthstate", "MyHealthState"],
  ])("preserves %s redirect before loading the denied page", async (_case, user, authenticated, source, target, heading) => {
    fixture.auth.user = user;
    fixture.auth.isAuthenticated = authenticated;
    await renderApp(source);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(target);
    const denied = source === "/patients" ? "PatientsPage" : "PatientAccessRequestsPage";
    expect(fixture.imports).not.toHaveBeenCalledWith(denied);
    expect(fixture.renders).not.toHaveBeenCalledWith(denied);
  });

  test.each(routes)("direct route resolves %s and preserves its parameters", async (name, _folder, path, role, params) => {
    fixture.auth.user.role = role;
    chunkGates[name] = deferred();
    await renderApp(path);
    await screen.findByRole("status");
    expect(fixture.renders).not.toHaveBeenCalled();
    await act(async () => chunkGates[name].resolve());
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("params").textContent)).toEqual(params);
    expect(fixture.imports.mock.calls).toEqual([[name]]);
  });

  test("page loading preserves an open shell and returning uses the already loaded route", async () => {
    chunkGates.CalendarPage = deferred();
    const { container } = await renderApp("/patients");
    await screen.findByRole("heading", { name: "PatientsPage" });
    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const navbar = screen.getByRole("navigation");
    const sidebar = container.querySelector("aside");
    fireEvent.click(screen.getByRole("link", { name: "Calendar link" }));
    await screen.findByRole("status");
    expect(screen.getByRole("navigation")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
    await act(async () => chunkGates.CalendarPage.resolve());
    await screen.findByRole("heading", { name: "CalendarPage" });
    fireEvent.click(screen.getByRole("link", { name: "Patients link" }));
    await screen.findByRole("heading", { name: "PatientsPage" });
    expect(fixture.imports.mock.calls.filter(([name]) => name === "PatientsPage")).toHaveLength(1);
    expect(screen.getByRole("navigation")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
  });

  test("a rejected chunk preserves auth and another route can still load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chunkGates.ProfilePage = deferred();
    const originalAuth = { ...fixture.auth };
    await renderApp("/profile");
    await screen.findByRole("status");
    await act(async () => chunkGates.ProfilePage.reject(new Error("PRIVATE_IMPORT_DETAILS")));
    await screen.findByRole("alert");
    expect(fixture.auth).toEqual(originalAuth);
    expect(fixture.auth.logout).not.toHaveBeenCalled();
    expect(screen.queryByText(/PRIVATE_IMPORT_DETAILS/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Patients link" }));
    await screen.findByRole("heading", { name: "PatientsPage" });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fixture.auth).toEqual(originalAuth);
  });
});

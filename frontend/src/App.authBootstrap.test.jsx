import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./lib/axios.js", () => ({ default: api }));
vi.mock("./components/Navbar.jsx", () => ({ default: () => {
  const navigate = useNavigate();
  return <nav><Link to="/patients">Patients link</Link><Link to="/calendar">Calendar link</Link><Link to="/">Home link</Link><button onClick={() => navigate(-1)}>Back</button></nav>;
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
vi.mock("./pages/patientsrecord/PatientsPage.jsx", () => ({ default: () => <h1>Patients</h1> }));
vi.mock("./pages/calendar/CalendarPage.jsx", () => ({ default: () => <h1>Calendar</h1> }));
vi.mock("./pages/docrecords/MyHealthState.jsx", () => ({ default: () => <h1>Patient portal</h1> }));
const user = { _id: "synthetic-doctor", role: "doctor", isVerified: true };
const response = (value = user) => ({ data: { user: value } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let store;
async function start(path = "/patients", { persisted, strict = false } = {}) {
  window.history.replaceState({}, "", path);
  if (persisted) localStorage.setItem("drvips-auth", JSON.stringify({ state: { user: persisted, isAuthenticated: true }, version: 0 }));
  store = (await import("./stores/authStore.js")).useAuthStore;
  const { default: i18n } = await import("./i18n.js"); await i18n.changeLanguage("en");
  const { default: App } = await import("./App.jsx");
  const tree = <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
beforeEach(() => { vi.resetModules(); api.get.mockReset(); api.post.mockReset(); localStorage.clear(); api.get.mockResolvedValue(response()); });
afterEach(() => cleanup());
describe("App bootstrap with real auth store and guards", () => {
  test.each([false, true])("direct protected startup makes exactly one authoritative request, StrictMode=%s", async (strict) => {
    const gate = deferred(); api.get.mockReturnValue(gate.promise);
    await start("/patients", { persisted: user, strict });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Patients" })).not.toBeInTheDocument();
    await act(async () => gate.resolve(response()));
    await screen.findByRole("heading", { name: "Patients" });
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

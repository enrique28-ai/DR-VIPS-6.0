import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PrivateRoute from "./PrivateRoute.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const authMock = vi.hoisted(() => ({
  state: {
    isAuthenticated: false,
    checkAuth: vi.fn(),
  },
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: Object.assign(vi.fn(() => authMock.state), {
    getState: vi.fn(() => authMock.state),
  }),
}));

const setAuthState = (overrides = {}) => {
  authMock.state = {
    isAuthenticated: false,
    checkAuth: vi.fn().mockResolvedValue(undefined),
    syncSession: (options) => {
      const validation = { ...options, fresh: true };
      delete validation.event;
      return authMock.state.checkAuth(validation);
    },
    ...overrides,
  };
  useAuthStore.mockImplementation(() => authMock.state);
  useAuthStore.getState.mockImplementation(() => authMock.state);
};

const renderPrivateRoute = () =>
  render(
    <MemoryRouter initialEntries={["/private"]}>
      <NavigationProbe />
      <Routes>
        <Route
          path="/private"
          element={
            <PrivateRoute>
              <div>Private content</div>
            </PrivateRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <span data-testid="navigation-key">{location.key}</span>
    <button onClick={() => navigate("/private?view=changed", { state: { source: "synthetic" } })}>Change private location</button>
  </>;
}

describe("PrivateRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState();
  });

  test("renders children when the user remains authenticated after checkAuth", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({ isAuthenticated: true, checkAuth });

    renderPrivateRoute();

    await waitFor(() => expect(screen.getByText("Private content")).toBeInTheDocument());
    expect(checkAuth).toHaveBeenCalledTimes(1);
  });

  test("redirects unauthenticated users to login", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({ isAuthenticated: false, checkAuth });

    renderPrivateRoute();

    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });
  test("blocks an already authenticated session while a newer global validation is pending", async () => {
    setAuthState({ isAuthenticated: true, isCheckingAuth: true });
    renderPrivateRoute();
    await act(async () => {});
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });
  test("persisted pageshow requests a fresh round", async () => {
    setAuthState({ isAuthenticated: true });
    renderPrivateRoute();
    await screen.findByText("Private content");
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event));
    expect(authMock.state.checkAuth).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true }));
  });

  test("uses pageshow without registering deprecated unload or beforeunload listeners", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    try {
      setAuthState({ isAuthenticated: true });
      const view = renderPrivateRoute();
      await screen.findByText("Private content");
      expect(added.mock.calls.some(([event]) => event === "unload" || event === "beforeunload")).toBe(false);
      const handler = added.mock.calls.find(([event]) => event === "pageshow")[1];
      view.unmount();
      expect(removed).toHaveBeenCalledWith("pageshow", handler);
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });

  test("ordinary pageshow does not add an authentication request", async () => {
    setAuthState({ isAuthenticated: true });
    renderPrivateRoute();
    await screen.findByText("Private content");
    await act(async () => window.dispatchEvent(new Event("pageshow")));
    expect(authMock.state.checkAuth).toHaveBeenCalledTimes(1);
  });

  test("an obsolete restore callback cannot release the latest restore's loading gate", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({ isAuthenticated: true, checkAuth });
    renderPrivateRoute();
    await screen.findByText("Private content");
    let resolveFirst, resolveLatest;
    checkAuth.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveLatest = resolve; }));
    const restore = () => {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    };
    act(restore);
    act(restore);
    expect(screen.getByText("Private content")).not.toBeVisible();
    await act(async () => resolveFirst());
    expect(screen.getByText("Private content")).not.toBeVisible();
    await act(async () => resolveLatest());
    await screen.findByText("Private content");
    expect(checkAuth).toHaveBeenCalledTimes(3);
  });

  test("query/state navigation and pageshow use the current identity and stay blocked while validation is pending", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({ isAuthenticated: true, checkAuth });
    renderPrivateRoute();
    await screen.findByText("Private content");
    const originalKey = screen.getByTestId("navigation-key").textContent;
    let resolveNavigation;
    checkAuth.mockReturnValueOnce(new Promise((resolve) => { resolveNavigation = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Change private location" }));
    await waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    const currentKey = screen.getByTestId("navigation-key").textContent;
    expect(currentKey).not.toBe(originalKey);
    expect(checkAuth).toHaveBeenLastCalledWith({
      location: { pathname: "/private", key: currentKey }, guard: expect.anything(),
    });
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
    await act(async () => resolveNavigation());
    await screen.findByText("Private content");
    let resolveRestore;
    checkAuth.mockReturnValueOnce(new Promise((resolve) => { resolveRestore = resolve; }));
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event));
    expect(checkAuth).toHaveBeenLastCalledWith({
      location: { pathname: "/private", key: currentKey }, guard: expect.anything(), fresh: true,
    });
    expect(screen.getByText("Private content")).not.toBeVisible();
    await act(async () => resolveRestore());
    await screen.findByText("Private content");
  });

});

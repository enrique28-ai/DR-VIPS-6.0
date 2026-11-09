import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import AuthOnlyRoute from "./AuthOnlyRoute.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const authMock = vi.hoisted(() => ({
  state: {
    isAuthenticated: false,
    user: null,
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
    user: null,
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

const renderAuthOnlyRoute = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <NavigationProbe />
      <Routes>
        <Route
          path="/login"
          element={
            <AuthOnlyRoute>
              <div>Guest login form</div>
            </AuthOnlyRoute>
          }
        />
        <Route path="/patients" element={<div>Doctor patients page</div>} />
        <Route path="/docrecords/myhealthstate" element={<div>Patient health page</div>} />
      </Routes>
    </MemoryRouter>,
  );

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <span data-testid="navigation-key">{location.key}</span>
    <button onClick={() => navigate("/login?view=changed", { state: { source: "synthetic" } })}>Change login location</button>
  </>;
}

describe("AuthOnlyRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState();
  });

  test("renders children for guests", async () => {
    renderAuthOnlyRoute();

    await waitFor(() => expect(screen.getByText("Guest login form")).toBeInTheDocument());
    expect(authMock.state.checkAuth).not.toHaveBeenCalled();
  });

  test("redirects authenticated doctors to patients", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({
      isAuthenticated: true,
      user: { role: "doctor" },
      checkAuth,
    });

    renderAuthOnlyRoute();

    await waitFor(() => expect(screen.getByText("Doctor patients page")).toBeInTheDocument());
    expect(checkAuth).toHaveBeenCalledTimes(1);
  });

  test("redirects authenticated patients to their health state", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({
      isAuthenticated: true,
      user: { role: "patient" },
      checkAuth,
    });

    renderAuthOnlyRoute();

    await waitFor(() => expect(screen.getByText("Patient health page")).toBeInTheDocument());
    expect(checkAuth).toHaveBeenCalledTimes(1);
  });
  test("guest form remains usable while unrelated bootstrap is pending", async () => {
    setAuthState({ isCheckingAuth: true });
    renderAuthOnlyRoute();
    await screen.findByText("Guest login form");
    expect(authMock.state.checkAuth).not.toHaveBeenCalled();
  });
  test("authenticated redirect waits for authoritative global validation", async () => {
    setAuthState({ isAuthenticated: true, isCheckingAuth: true, user: { role: "doctor" } });
    renderAuthOnlyRoute();
    await act(async () => {});
    expect(screen.queryByText("Doctor patients page")).not.toBeInTheDocument();
  });

  test("pageshow uses the latest pathname/key after a query and state navigation without a guest auth request", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    setAuthState({ checkAuth });
    renderAuthOnlyRoute();
    await screen.findByText("Guest login form");
    const originalKey = screen.getByTestId("navigation-key").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Change login location" }));
    await waitFor(() => expect(screen.getByTestId("navigation-key").textContent).not.toBe(originalKey));
    expect(checkAuth).not.toHaveBeenCalled();
    const currentKey = screen.getByTestId("navigation-key").textContent;
    useAuthStore.getState.mockReturnValue({ ...authMock.state, isAuthenticated: true });
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event));
    expect(checkAuth).toHaveBeenCalledExactlyOnceWith({
      location: { pathname: "/login", key: currentKey }, guard: expect.anything(), fresh: true,
    });
  });

});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
    ...overrides,
  };
  useAuthStore.mockImplementation(() => authMock.state);
  useAuthStore.getState.mockImplementation(() => authMock.state);
};

const renderAuthOnlyRoute = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
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
});

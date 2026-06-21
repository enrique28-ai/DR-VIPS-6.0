import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
    ...overrides,
  };
  useAuthStore.mockImplementation(() => authMock.state);
  useAuthStore.getState.mockImplementation(() => authMock.state);
};

const renderPrivateRoute = () =>
  render(
    <MemoryRouter initialEntries={["/private"]}>
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
});

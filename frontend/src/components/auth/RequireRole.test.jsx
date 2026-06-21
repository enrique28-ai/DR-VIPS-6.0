import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RequireRole from "./RequireRole.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const authMock = vi.hoisted(() => ({
  state: {
    user: null,
    isAuthenticated: false,
    isCheckingAuth: false,
  },
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(() => authMock.state),
}));

const setAuthState = (overrides = {}) => {
  authMock.state = {
    user: null,
    isAuthenticated: false,
    isCheckingAuth: false,
    ...overrides,
  };
  useAuthStore.mockImplementation(() => authMock.state);
};

const renderRequireRole = ({ allowed = ["doctor"], initialPath = "/doctor-only" } = {}) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/doctor-only"
          element={
            <RequireRole allowed={allowed}>
              <div>Allowed protected page</div>
            </RequireRole>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/patients" element={<div>Doctor home</div>} />
        <Route path="/docrecords/myhealthstate" element={<div>Patient home</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("RequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState();
  });

  test("renders children for an authenticated user with an allowed role", () => {
    setAuthState({
      isAuthenticated: true,
      user: { role: "doctor" },
    });

    renderRequireRole();

    expect(screen.getByText("Allowed protected page")).toBeInTheDocument();
  });

  test("redirects a disallowed patient to the patient home", () => {
    setAuthState({
      isAuthenticated: true,
      user: { role: "patient" },
    });

    renderRequireRole();

    expect(screen.getByText("Patient home")).toBeInTheDocument();
    expect(screen.queryByText("Allowed protected page")).not.toBeInTheDocument();
  });
});

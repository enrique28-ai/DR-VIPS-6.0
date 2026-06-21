import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RequireVerified from "./RequireVerified.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const authMock = vi.hoisted(() => ({
  state: {
    user: null,
    isCheckingAuth: false,
  },
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(() => authMock.state),
}));

const setAuthState = (overrides = {}) => {
  authMock.state = {
    user: null,
    isCheckingAuth: false,
    ...overrides,
  };
  useAuthStore.mockImplementation(() => authMock.state);
};

const renderRequireVerified = () =>
  render(
    <MemoryRouter initialEntries={["/verified-only"]}>
      <Routes>
        <Route
          path="/verified-only"
          element={
            <RequireVerified>
              <div>Verified protected page</div>
            </RequireVerified>
          }
        />
        <Route path="/verify-email" element={<div>Verify email page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("RequireVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState();
  });

  test("renders children for verified users", () => {
    setAuthState({ user: { isVerified: true } });

    renderRequireVerified();

    expect(screen.getByText("Verified protected page")).toBeInTheDocument();
  });

  test("redirects unverified users to email verification", () => {
    setAuthState({ user: { isVerified: false } });

    renderRequireVerified();

    expect(screen.getByText("Verify email page")).toBeInTheDocument();
    expect(screen.queryByText("Verified protected page")).not.toBeInTheDocument();
  });

  test("renders nothing while auth state is still checking", () => {
    setAuthState({ isCheckingAuth: true });

    const { container } = renderRequireVerified();

    expect(container).toBeEmptyDOMElement();
  });
});

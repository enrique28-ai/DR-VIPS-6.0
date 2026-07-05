import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import toast from "react-hot-toast";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "auth.reset.button": "Reset password",
        "auth.reset.confirmPasswordLabel": "Confirm password",
        "auth.reset.errors.mismatch": "Passwords do not match",
        "auth.reset.errors.weakPassword": "Password is too weak",
        "auth.reset.newPasswordLabel": "New password",
        "auth.reset.title": "Reset password",
        "password.levels.fair": "Fair",
        "password.levels.good": "Good",
        "password.levels.strong": "Strong",
        "password.levels.veryWeak": "Very weak",
        "password.levels.weak": "Weak",
        "password.rules.hasCase": "Uppercase and lowercase letters",
        "password.rules.hasNumber": "A number",
        "password.rules.hasSpecial": "A special character",
        "password.rules.minLen": "At least 6 characters",
        "password.strengthLabel": "Password strength",
      }[key] ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const renderResetPassword = ({
  isLoading = false,
  resetPassword = vi.fn().mockResolvedValue({ success: true }),
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    resetPassword,
  });

  const view = render(
    <MemoryRouter initialEntries={["/reset-password/reset-token"]}>
      <Routes>
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );

  return {
    ...view,
    resetPassword,
    form: () => view.container.querySelector("form"),
    passwordInputs: () =>
      Array.from(view.container.querySelectorAll('input[type="password"]')),
  };
};

const fillPasswords = (view, password = "Abcdef1!", confirm = password) => {
  const [passwordInput, confirmInput] = view.passwordInputs();

  fireEvent.change(passwordInput, { target: { value: password } });
  fireEvent.change(confirmInput, { target: { value: confirm } });
};

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  test("renders the reset-password form and password strength guidance", () => {
    const view = renderResetPassword();

    expect(screen.getByRole("heading", { name: "Reset password" })).toBeInTheDocument();
    expect(view.form()).toHaveAttribute("aria-busy", "false");
    expect(view.passwordInputs()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(screen.getByText("At least 6 characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase and lowercase letters")).toBeInTheDocument();
    expect(screen.getByText("A number")).toBeInTheDocument();
    expect(screen.getByText("A special character")).toBeInTheDocument();
    expect(view.passwordInputs()[0]).toHaveAttribute("aria-describedby", "reset-password-help");
    expect(document.getElementById("reset-password-help")).toHaveTextContent("Password strength");
  });

  test("typing new and confirm passwords updates both inputs", () => {
    const view = renderResetPassword();

    fillPasswords(view, "Abcdef1!", "Different1!");

    const [passwordInput, confirmInput] = view.passwordInputs();
    expect(passwordInput).toHaveValue("Abcdef1!");
    expect(confirmInput).toHaveValue("Different1!");
  });

  test("weak password keeps the submit button disabled", () => {
    const view = renderResetPassword();

    fillPasswords(view, "abcdef", "abcdef");

    expect(screen.getByRole("button", { name: "Reset password" })).toBeDisabled();
  });

  test("weak password direct submit shows an error and does not reset", () => {
    const view = renderResetPassword();

    fillPasswords(view, "abcdef", "abcdef");
    fireEvent.submit(view.form());

    expect(toast.error).toHaveBeenCalledWith("Password is too weak");
    expect(view.resetPassword).not.toHaveBeenCalled();
  });

  test("mismatched confirmation shows an error and does not reset", () => {
    const view = renderResetPassword();

    fillPasswords(view, "Abcdef1!", "Abcdef2!");
    fireEvent.submit(view.form());

    expect(toast.error).toHaveBeenCalledWith("Passwords do not match");
    expect(view.resetPassword).not.toHaveBeenCalled();
  });

  test("valid matching password calls resetPassword with the route token", async () => {
    const resetPassword = vi.fn().mockResolvedValue({ success: true });
    const view = renderResetPassword({ resetPassword });

    fillPasswords(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith("reset-token", "Abcdef1!");
    });
  });

  test("successful reset navigates to login", async () => {
    const resetPassword = vi.fn().mockResolvedValue({ success: true });
    const view = renderResetPassword({ resetPassword });

    fillPasswords(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login");
    });
  });

  test("failed reset does not navigate or render a local error", async () => {
    const resetPassword = vi.fn().mockRejectedValue(new Error("reset failed"));
    const view = renderResetPassword({ resetPassword });

    fillPasswords(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith("reset-token", "Abcdef1!");
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("reset failed")).not.toBeInTheDocument();
  });

  test("loading state marks the submit button busy and disabled", () => {
    renderResetPassword({ isLoading: true });

    const submitButton = screen.getByRole("button", { name: "Reset password" });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
    expect(submitButton.closest("form")).toHaveAttribute("aria-busy", "true");
  });
});

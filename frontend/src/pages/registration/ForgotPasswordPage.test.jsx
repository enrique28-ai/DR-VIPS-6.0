import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ForgotPasswordPage from "./ForgotPasswordPage.jsx";
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options = {}) =>
      ({
        "auth.forgot.backToLogin": "Back to login",
        "auth.forgot.button": "Send reset code",
        "auth.forgot.codeIntro": options.defaultValue,
        "auth.forgot.emailLabel": "Email",
        "auth.forgot.emailPlaceholder": "you@example.com",
        "auth.forgot.intro": "Enter your email and we will send a reset code.",
        "auth.forgot.remember": "Remember your password?",
        "auth.forgot.resendLink": options.defaultValue,
        "auth.forgot.sentTitle1": "We sent a code to",
        "auth.forgot.sentTitle2": "check your inbox.",
        "auth.forgot.title": "Forgot password",
        "auth.forgot.verifyBtn": options.defaultValue,
      }[key] ?? options.defaultValue ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const renderForgotPassword = ({
  isLoading = false,
  forgotPassword = vi.fn().mockResolvedValue({ success: true }),
  verifyResetCode = vi.fn().mockResolvedValue({ token: "reset-token" }),
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    forgotPassword,
    verifyResetCode,
  });

  const view = render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

  return {
    ...view,
    forgotPassword,
    verifyResetCode,
    emailInput: () => screen.getByPlaceholderText("you@example.com"),
    codeInputs: () => Array.from(view.container.querySelectorAll("input")).slice(0, 6),
  };
};

const requestCode = async (view, email = "Person@Example.com") => {
  fireEvent.change(view.emailInput(), { target: { value: email } });
  fireEvent.submit(view.container.querySelector("form"));

  await screen.findByText("Enter the 6-digit code we sent to your email.");
};

const fillCode = (inputs, digits = "123456") => {
  digits.split("").forEach((digit, index) => {
    fireEvent.change(inputs[index], { target: { value: digit } });
  });
};

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  test("renders the initial forgot-password form", () => {
    const view = renderForgotPassword();

    expect(screen.getByRole("heading", { name: "Forgot password" })).toBeInTheDocument();
    expect(screen.getByText("Enter your email and we will send a reset code.")).toBeInTheDocument();
    expect(view.emailInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send reset code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/login");
  });

  test("typing email updates the email input", () => {
    const view = renderForgotPassword();

    fireEvent.change(view.emailInput(), { target: { value: "person@example.com" } });

    expect(view.emailInput()).toHaveValue("person@example.com");
  });

  test("submitting calls forgotPassword with the exact typed email", async () => {
    const forgotPassword = vi.fn().mockResolvedValue({ success: true });
    const view = renderForgotPassword({ forgotPassword });

    fireEvent.change(view.emailInput(), { target: { value: "Person@Example.com" } });
    fireEvent.submit(view.container.querySelector("form"));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith("Person@Example.com");
    });
  });

  test("successful email submit renders the reset-code step", async () => {
    const view = renderForgotPassword();

    await requestCode(view);

    expect(screen.getByText("Person@Example.com")).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code we sent to your email.")).toBeInTheDocument();
    expect(view.codeInputs()).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
  });

  test("typing one code digit advances focus to the next input", async () => {
    const view = renderForgotPassword();
    await requestCode(view);
    const inputs = view.codeInputs();

    inputs[0].focus();
    fireEvent.change(inputs[0], { target: { value: "1" } });

    expect(inputs[0]).toHaveValue("1");
    expect(inputs[1]).toHaveFocus();
  });

  test("backspace on an empty code input moves focus to the previous input", async () => {
    const view = renderForgotPassword();
    await requestCode(view);
    const inputs = view.codeInputs();

    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: "Backspace" });

    expect(inputs[0]).toHaveFocus();
  });

  test("pasting six digits into the first code input fills all code inputs", async () => {
    const view = renderForgotPassword();
    await requestCode(view);
    const inputs = view.codeInputs();

    fireEvent.change(inputs[0], { target: { value: "123456" } });

    expect(inputs.map((input) => input.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(inputs[5]).toHaveFocus();
  });

  test("manual code submit verifies the code and navigates to the reset-token route", async () => {
    const verifyResetCode = vi.fn().mockResolvedValue({ token: "reset-token" });
    const view = renderForgotPassword({ verifyResetCode });
    await requestCode(view);
    const inputs = view.codeInputs();

    fireEvent.change(inputs[0], { target: { value: "123456" } });
    fireEvent.submit(view.container.querySelector("form"));

    await waitFor(() => {
      expect(verifyResetCode).toHaveBeenCalledWith("Person@Example.com", "123456");
      expect(navigateMock).toHaveBeenCalledWith("/reset-password/reset-token");
    });
  });

  test("completing all six code digits auto-submits and navigates on success", async () => {
    const verifyResetCode = vi.fn().mockResolvedValue({ token: "reset-token" });
    const view = renderForgotPassword({ verifyResetCode });
    await requestCode(view);

    fillCode(view.codeInputs());

    await waitFor(() => {
      expect(verifyResetCode).toHaveBeenCalledWith("Person@Example.com", "123456");
      expect(navigateMock).toHaveBeenCalledWith("/reset-password/reset-token");
    });
  });

  test("failed code verification does not navigate or render local error text", async () => {
    const verifyResetCode = vi.fn().mockRejectedValue(new Error("bad code"));
    const view = renderForgotPassword({ verifyResetCode });
    await requestCode(view);

    fillCode(view.codeInputs());

    await waitFor(() => {
      expect(verifyResetCode).toHaveBeenCalledWith("Person@Example.com", "123456");
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("bad code")).not.toBeInTheDocument();
  });

  test("resend code calls forgotPassword again and clears existing code inputs", async () => {
    const forgotPassword = vi.fn().mockResolvedValue({ success: true });
    const view = renderForgotPassword({ forgotPassword });
    await requestCode(view);
    const inputs = view.codeInputs();

    fireEvent.change(inputs[0], { target: { value: "123" } });
    expect(inputs.map((input) => input.value)).toEqual(["1", "2", "3", "", "", ""]);

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledTimes(2);
    });
    expect(forgotPassword).toHaveBeenLastCalledWith("Person@Example.com");
    expect(view.codeInputs().map((input) => input.value)).toEqual(["", "", "", "", "", ""]);
  });

  test("loading state marks the primary button busy and disabled", () => {
    renderForgotPassword({ isLoading: true });

    const submitButton = screen.getByRole("button", { name: "Send reset code" });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
  });
});

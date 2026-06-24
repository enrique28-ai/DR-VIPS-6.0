import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EmailVerificationPage from "./EmailVerificationPage.jsx";
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
    t: (key) =>
      ({
        "auth.verify.button": "Verify",
        "auth.verify.intro": "Enter the verification code sent to your email.",
        "auth.verify.resend": "Resend code",
        "auth.verify.title": "Verify your email",
      }[key] ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const renderEmailVerification = ({
  isLoading = false,
  verifyEmail = vi.fn().mockResolvedValue(true),
  resendCode = vi.fn().mockResolvedValue(true),
  user = { role: "doctor" },
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    verifyEmail,
    resendCode,
    user,
  });

  const view = render(
    <MemoryRouter>
      <EmailVerificationPage />
    </MemoryRouter>,
  );

  return {
    ...view,
    inputs: () => Array.from(view.container.querySelectorAll("input")),
    verifyEmail,
    resendCode,
  };
};

const fillCode = (inputs, digits = "123456") => {
  digits.split("").forEach((digit, index) => {
    fireEvent.change(inputs[index], { target: { value: digit } });
  });
};

describe("EmailVerificationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  test("renders title, intro, six code inputs, verify button, and resend button", () => {
    const { inputs } = renderEmailVerification();

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByText("Enter the verification code sent to your email.")).toBeInTheDocument();
    expect(inputs()).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
  });

  test("typing one digit advances focus to the next input", () => {
    const { inputs } = renderEmailVerification();
    const codeInputs = inputs();

    codeInputs[0].focus();
    fireEvent.change(codeInputs[0], { target: { value: "1" } });

    expect(codeInputs[0]).toHaveValue("1");
    expect(codeInputs[1]).toHaveFocus();
  });

  test("backspace on an empty input moves focus to the previous input", () => {
    const { inputs } = renderEmailVerification();
    const codeInputs = inputs();

    codeInputs[1].focus();
    fireEvent.keyDown(codeInputs[1], { key: "Backspace" });

    expect(codeInputs[0]).toHaveFocus();
  });

  test("pasting six digits into the first input fills all inputs", () => {
    const { inputs } = renderEmailVerification();
    const codeInputs = inputs();

    fireEvent.change(codeInputs[0], { target: { value: "123456" } });

    expect(codeInputs.map((input) => input.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(codeInputs[5]).toHaveFocus();
  });

  test("manual submit calls verifyEmail with the joined code", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(true);
    const { container, inputs } = renderEmailVerification({ verifyEmail });
    const codeInputs = inputs();

    fireEvent.change(codeInputs[0], { target: { value: "1" } });
    fireEvent.change(codeInputs[1], { target: { value: "2" } });
    fireEvent.change(codeInputs[2], { target: { value: "3" } });
    fireEvent.submit(container.querySelector("form"));

    await waitFor(() => {
      expect(verifyEmail).toHaveBeenCalledWith("123");
    });
  });

  test("completing all six digits auto-submits the joined code", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(true);
    const { inputs } = renderEmailVerification({ verifyEmail });

    fillCode(inputs());

    await waitFor(() => {
      expect(verifyEmail).toHaveBeenCalledWith("123456");
    });
  });

  test("successful verification navigates to patients for a doctor user", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(true);
    const { container, inputs } = renderEmailVerification({
      verifyEmail,
      user: { role: "doctor" },
    });

    fillCode(inputs());
    fireEvent.submit(container.querySelector("form"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/patients");
    });
  });

  test("successful verification navigates to patient health state for a patient user", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(true);
    const { container, inputs } = renderEmailVerification({
      verifyEmail,
      user: { role: "patient" },
    });

    fillCode(inputs());
    fireEvent.submit(container.querySelector("form"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/docrecords/myhealthstate");
    });
  });

  test("failed verification does not navigate or render a page-level error", async () => {
    const verifyEmail = vi.fn().mockRejectedValue(new Error("bad code"));
    const { container, inputs } = renderEmailVerification({ verifyEmail });

    fillCode(inputs());
    fireEvent.submit(container.querySelector("form"));

    await waitFor(() => {
      expect(verifyEmail).toHaveBeenCalled();
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("bad code")).not.toBeInTheDocument();
  });

  test("resend button calls resendCode", () => {
    const resendCode = vi.fn().mockResolvedValue(true);
    renderEmailVerification({ resendCode });

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    expect(resendCode).toHaveBeenCalledTimes(1);
  });

  test("loading state marks the verify button busy and disabled", () => {
    renderEmailVerification({ isLoading: true });

    const verifyButton = screen.getByRole("button", { name: "Verify" });
    expect(verifyButton).toBeDisabled();
    expect(verifyButton).toHaveAttribute("aria-busy", "true");
  });
});

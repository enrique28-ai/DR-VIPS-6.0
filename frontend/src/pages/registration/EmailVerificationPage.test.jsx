import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    button: ({ children, ...props }) => {
      const domProps = { ...props };
      delete domProps.whileHover;
      delete domProps.whileTap;
      return <button {...domProps}>{children}</button>;
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options = {}) =>
      ({
        "auth.verify.button": "Verify",
        "auth.verify.codeDigit": options.defaultValue,
        "auth.verify.codeLegend": options.defaultValue,
        "auth.verify.intro": "Enter the verification code sent to your email.",
        "auth.verify.resend": "Resend code",
        "auth.verify.title": "Verify your email",
      }[key] ?? options.defaultValue ?? key),
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
    inputs: () =>
      Array.from({ length: 6 }, (_, index) =>
        screen.getByRole("textbox", { name: `Verification code digit ${index + 1}` }),
      ),
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
    expect(screen.getByRole("group", { name: "Verification code" })).toBeInTheDocument();
    expect(inputs()).toHaveLength(6);
    expect(screen.getByLabelText("Verification code digit 1")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(screen.getByLabelText("Verification code digit 2")).not.toHaveAttribute("autocomplete");
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
  });

  test("uses a six-column mobile layout with responsive input sizing", () => {
    const { inputs } = renderEmailVerification();
    const fieldset = screen.getByRole("group", { name: "Verification code" });

    expect(fieldset).toHaveClass(
      "grid",
      "grid-cols-6",
      "gap-1",
      "sm:flex",
      "sm:justify-between",
      "sm:gap-2",
    );
    for (const input of inputs()) {
      expect(input).toHaveClass(
        "h-11",
        "w-full",
        "min-w-0",
        "text-xl",
        "sm:h-12",
        "sm:w-12",
        "sm:text-2xl",
      );
    }
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

  test("pasting six digits into the first input fills all inputs", async () => {
    const { inputs } = renderEmailVerification();
    const codeInputs = inputs();

    await act(async () => {
      fireEvent.change(codeInputs[0], { target: { value: "123456" } });
    });

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

  test("a pending automatic attempt is not duplicated by manual submit or store rerenders, and failure permits a manual retry", async () => {
    let rejectAttempt;
    const verifyEmail = vi.fn().mockReturnValueOnce(new Promise((_resolve, reject) => { rejectAttempt = reject; }))
      .mockResolvedValueOnce(true);
    const view = renderEmailVerification({ verifyEmail });
    fillCode(view.inputs());
    expect(verifyEmail).toHaveBeenCalledExactlyOnceWith("123456");
    fireEvent.submit(view.container.querySelector("form"));
    useAuthStore.mockReturnValue({ isLoading: true, verifyEmail, resendCode: view.resendCode, user: { role: "doctor" } });
    view.rerender(<MemoryRouter><EmailVerificationPage /></MemoryRouter>);
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    await act(async () => rejectAttempt(new Error("synthetic verification rejection")));
    useAuthStore.mockReturnValue({ isLoading: false, verifyEmail, resendCode: view.resendCode, user: { role: "patient" } });
    view.rerender(<MemoryRouter><EmailVerificationPage /></MemoryRouter>);
    await act(async () => {});
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.submit(view.container.querySelector("form"));
    await waitFor(() => expect(verifyEmail).toHaveBeenCalledTimes(2));
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith("/docrecords/myhealthstate");
  });

  test("editing a complete code during a pending attempt waits and then submits only the latest code once", async () => {
    let rejectAttempt;
    const verifyEmail = vi.fn().mockReturnValueOnce(new Promise((_resolve, reject) => { rejectAttempt = reject; }))
      .mockRejectedValueOnce(new Error("synthetic second rejection"));
    const view = renderEmailVerification({ verifyEmail });
    fillCode(view.inputs());
    fillCode(view.inputs(), "654321");
    fireEvent.submit(view.container.querySelector("form"));
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    await act(async () => rejectAttempt(new Error("synthetic first rejection")));
    await waitFor(() => expect(verifyEmail).toHaveBeenCalledTimes(2));
    expect(verifyEmail).toHaveBeenLastCalledWith("654321");
    await act(async () => {});
    expect(verifyEmail).toHaveBeenCalledTimes(2);
    expect(navigateMock).not.toHaveBeenCalled();
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

  test("resend button calls resendCode", async () => {
    const resendCode = vi.fn().mockResolvedValue(true);
    renderEmailVerification({ resendCode });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    });

    expect(resendCode).toHaveBeenCalledTimes(1);
  });

  test("shared auth loading disables both buttons without attributing a spinner to either", () => {
    renderEmailVerification({ isLoading: true });
    for (const name of ["Verify", "Resend code"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "false");
    }
  });

  test("resend coalesces clicks, blocks verification while pending and handles failure without discarding input", async () => {
    let rejectResend;
    const resendCode = vi.fn().mockReturnValueOnce(new Promise((_resolve, reject) => { rejectResend = reject; }))
      .mockResolvedValueOnce(true);
    const view = renderEmailVerification({ resendCode });
    fireEvent.change(view.inputs()[0], { target: { value: "123" } });
    const resend = screen.getByRole("button", { name: "Resend code" });
    fireEvent.click(resend);
    fireEvent.click(resend);
    fireEvent.submit(view.container.querySelector("form"));
    expect(resendCode).toHaveBeenCalledTimes(1);
    expect(view.verifyEmail).not.toHaveBeenCalled();
    expect(resend).toBeDisabled();
    expect(resend).toHaveAttribute("aria-busy", "true");
    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeDisabled();
    expect(verify).toHaveAttribute("aria-busy", "false");
    expect(view.inputs()[0]).toBeDisabled();
    await act(async () => rejectResend(new Error("synthetic delivery failure")));
    expect(view.inputs().map((input) => input.value).join("")).toBe("123");
    expect(resend).not.toBeDisabled();
    expect(verify).not.toBeDisabled();
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(resend);
    await waitFor(() => expect(view.inputs().every((input) => input.value === "")).toBe(true));
    expect(resendCode).toHaveBeenCalledTimes(2);
    expect(view.verifyEmail).not.toHaveBeenCalled();
  });

  test.each([true, false])("only Verify spins and both controls recover when verification succeeds=%s", async (success) => {
    const request = Promise.withResolvers();
    const verifyEmail = vi.fn().mockReturnValue(request.promise);
    const view = renderEmailVerification({ verifyEmail });
    fillCode(view.inputs());
    const verify = screen.getByRole("button", { name: "Verify" });
    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(verify).toBeDisabled();
    expect(verify).toHaveAttribute("aria-busy", "true");
    expect(resend).toBeDisabled();
    expect(resend).toHaveAttribute("aria-busy", "false");
    fireEvent.click(resend);
    fireEvent.submit(view.container.querySelector("form"));
    expect(verifyEmail).toHaveBeenCalledExactlyOnceWith("123456");
    expect(view.resendCode).not.toHaveBeenCalled();

    await act(async () => {
      if (success) request.resolve(true);
      else request.reject(new Error("synthetic verification failure"));
    });
    expect(verify).toHaveAttribute("aria-busy", "false");
    expect(verify).toBeEnabled();
    expect(resend).toBeEnabled();
    expect(navigateMock).toHaveBeenCalledTimes(success ? 1 : 0);
  });

  test("successful resend clears any code entered during the pending request without verifying it", async () => {
    const request = Promise.withResolvers();
    const view = renderEmailVerification({ resendCode: vi.fn().mockReturnValue(request.promise) });
    const resend = screen.getByRole("button", { name: "Resend code" });
    fireEvent.click(resend);
    fillCode(view.inputs());
    fireEvent.submit(view.container.querySelector("form"));
    expect(view.verifyEmail).not.toHaveBeenCalled();

    await act(async () => request.resolve(true));
    expect(resend).toBeEnabled();
    expect(resend).toHaveAttribute("aria-busy", "false");
    expect(view.inputs().every((input) => input.value === "")).toBe(true);
    expect(view.verifyEmail).not.toHaveBeenCalled();
    await act(async () => {
      fillCode(view.inputs());
    });
    expect(view.verifyEmail).toHaveBeenCalledExactlyOnceWith("123456");
  });

  test("an older resend completion leaves a remounted form's code and controls intact", async () => {
    const request = Promise.withResolvers();
    const view = renderEmailVerification({ resendCode: vi.fn().mockReturnValue(request.promise) });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    view.unmount();
    const next = renderEmailVerification();
    fireEvent.change(next.inputs()[0], { target: { value: "1" } });

    await act(async () => request.resolve(true));
    expect(next.inputs()[0]).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
    expect(next.verifyEmail).not.toHaveBeenCalled();
  });
});

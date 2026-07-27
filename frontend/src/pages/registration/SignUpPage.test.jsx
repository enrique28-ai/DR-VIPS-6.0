import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-hot-toast";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SignUpPage from "./SignUpPage.jsx";
import { useAuthStore } from "../../stores/authStore.js";

const navigateMock = vi.hoisted(() => vi.fn());
const captchaHarness = vi.hoisted(() => ({
  config: {
    enabled: false,
    provider: "recaptcha",
    siteKey: "recaptcha-site-key",
    isSupportedProvider: true,
    isValid: true,
  },
  getTokenForAction: vi.fn(),
  reset: vi.fn(),
  widgetProps: null,
}));

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

vi.mock("../../lib/captchaConfig.js", () => ({
  captchaConfig: captchaHarness.config,
}));

vi.mock("../../components/forms/CaptchaWidget.jsx", async () => {
  const React = await vi.importActual("react");
  const CaptchaWidget = React.forwardRef(function CaptchaWidget(props, ref) {
    captchaHarness.widgetProps = props;
    React.useImperativeHandle(ref, () => ({
      getTokenForAction: captchaHarness.getTokenForAction,
      reset: captchaHarness.reset,
    }));
    return (
      <button
        type="button"
        data-testid="captcha-widget"
        data-action={props.action}
        onClick={() => props.onTokenChange("credential-token")}
      >
        captcha
      </button>
    );
  });
  return { default: CaptchaWidget };
});

vi.mock("react-hot-toast", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "auth.signup.button": "Sign up",
        "auth.signup.divider": "or",
        "auth.signup.emailLabel": "Email",
        "auth.signup.emailPlaceholder": "you@example.com",
        "auth.signup.errors.captcha": "Please complete the captcha",
        "auth.signup.errors.weakPassword": "Password is too weak",
        "auth.signup.google": "Continue with Google",
        "auth.signup.haveAccount": "Already have an account?",
        "auth.signup.loginLink": "Log in",
        "auth.signup.passwordHint": "Use a strong password.",
        "auth.signup.passwordLabel": "Password",
        "auth.signup.roleDoctor": "Doctor",
        "auth.signup.rolePatient": "Patient",
        "auth.signup.roleQuestion": "What role do you need?",
        "auth.signup.title": "Create account",
        "auth.signup.usernameLabel": "Name",
        "auth.signup.usernamePlaceholder": "Dr Person",
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

const renderSignUpPage = ({
  isLoading = false,
  signup = vi.fn().mockResolvedValue({ role: "doctor" }),
  googleStart = vi.fn().mockResolvedValue(undefined),
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    signup,
    googleStart,
  });

  const view = render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );

  return {
    ...view,
    emailInput: () => screen.getByPlaceholderText("you@example.com"),
    form: () => view.container.querySelector("form"),
    googleStart,
    nameInput: () => screen.getByPlaceholderText("Dr Person"),
    passwordInput: () => view.container.querySelector('input[type="password"]'),
    roleInput: (name) => screen.getByRole("radio", { name }),
    signup,
  };
};

const fillSignUpForm = (
  view,
  {
    name = "Dr Person",
    email = "doctor@example.com",
    password = "Abcdef1!",
  } = {},
) => {
  fireEvent.change(view.nameInput(), { target: { value: name } });
  fireEvent.change(view.emailInput(), { target: { value: email } });
  fireEvent.change(view.passwordInput(), { target: { value: password } });
};

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    Object.assign(captchaHarness.config, {
      enabled: false,
      provider: "recaptcha",
      siteKey: "recaptcha-site-key",
      isSupportedProvider: true,
      isValid: true,
    });
    captchaHarness.widgetProps = null;
    captchaHarness.getTokenForAction.mockResolvedValue("google-token");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the signup form, role options, auth links, and Google button", () => {
    const view = renderSignUpPage();

    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(view.nameInput()).toHaveValue("");
    expect(view.emailInput()).toHaveValue("");
    expect(view.passwordInput()).toHaveValue("");
    expect(screen.getByText("Use a strong password.")).toBeInTheDocument();
    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(view.roleInput("Doctor")).toHaveAttribute("value", "doctor");
    expect(view.roleInput("Patient")).toHaveAttribute("value", "patient");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    const googleButton = screen.getByRole("button", { name: "Continue with Google" });
    expect(googleButton).toBeInTheDocument();
    expect(googleButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("typing username, email, and password updates all inputs", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view);

    expect(view.nameInput()).toHaveValue("Dr Person");
    expect(view.emailInput()).toHaveValue("doctor@example.com");
    expect(view.passwordInput()).toHaveValue("Abcdef1!");
  });

  test("doctor role is selected by default and patient selection changes the checked role", () => {
    const view = renderSignUpPage();

    expect(view.roleInput("Doctor")).toBeChecked();
    expect(view.roleInput("Patient")).not.toBeChecked();

    fireEvent.click(view.roleInput("Patient"));

    expect(view.roleInput("Doctor")).not.toBeChecked();
    expect(view.roleInput("Patient")).toBeChecked();
  });

  test("weak password keeps the signup button disabled", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view, { password: "abcdef" });

    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  });

  test("weak password direct submit shows an error and does not sign up", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view, { password: "abcdef" });
    fireEvent.submit(view.form());

    expect(toast.error).toHaveBeenCalledWith("Password is too weak");
    expect(view.signup).not.toHaveBeenCalled();
  });

  test("valid default-doctor submit calls signup with the default captcha-disabled payload", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "doctor" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        undefined,
        "doctor",
      );
    });
  });

  test("valid patient-role submit calls signup with patient role", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "patient" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.click(view.roleInput("Patient"));
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        undefined,
        "patient",
      );
    });
  });

  test("successful signup navigates to email verification", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "doctor" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/verify-email");
    });
  });

  test("failed signup does not navigate or render a local error", async () => {
    const signup = vi.fn().mockRejectedValue(new Error("signup failed"));
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalled();
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("signup failed")).not.toBeInTheDocument();
  });

  test("loading state marks the signup button busy and disabled", () => {
    renderSignUpPage({ isLoading: true });

    const submitButton = screen.getByRole("button", { name: "Sign up" });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
  });

  test("Google button calls googleStart with no captcha token by default", async () => {
    const googleStart = vi.fn().mockResolvedValue(undefined);
    renderSignUpPage({ googleStart });

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(googleStart).toHaveBeenCalledWith(undefined);
    });
  });

  test("does not render ReCAPTCHA in the default captcha-disabled environment", () => {
    renderSignUpPage();

    expect(screen.queryByTestId("captcha-widget")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith("Please complete the captcha");
  });

  test("preserves reCAPTCHA token compatibility for signup and Google auth", async () => {
    captchaHarness.config.enabled = true;
    const signup = vi.fn().mockResolvedValue({ role: "patient" });
    const googleStart = vi.fn().mockResolvedValue(undefined);
    const view = renderSignUpPage({ signup, googleStart });

    expect(screen.getByTestId("captcha-widget")).toHaveAttribute("data-action", "register");
    fireEvent.click(screen.getByTestId("captcha-widget"));
    fillSignUpForm(view);
    fireEvent.click(view.roleInput("Patient"));
    fireEvent.submit(view.form());

    await waitFor(() =>
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        "credential-token",
        "patient",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(googleStart).toHaveBeenCalledWith("credential-token"));
    expect(captchaHarness.getTokenForAction).not.toHaveBeenCalled();
  });

  test("uses the Turnstile register action, preserves role/password rules, and resets after signup failure", async () => {
    Object.assign(captchaHarness.config, {
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const signup = vi.fn().mockRejectedValue(new Error("bad signup"));
    const view = renderSignUpPage({ signup });

    expect(captchaHarness.widgetProps.action).toBe("register");
    fillSignUpForm(view, { password: "abcdef" });
    fireEvent.click(screen.getByTestId("captcha-widget"));
    fireEvent.submit(view.form());
    expect(toast.error).toHaveBeenCalledWith("Password is too weak");
    expect(signup).not.toHaveBeenCalled();

    fillSignUpForm(view);
    fireEvent.click(view.roleInput("Patient"));
    fireEvent.submit(view.form());
    await waitFor(() => {
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        "credential-token",
        "patient",
      );
      expect(captchaHarness.reset).toHaveBeenCalledTimes(1);
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("deduplicates pending Turnstile Google clicks and retries with a separate google_oauth token", async () => {
    Object.assign(captchaHarness.config, {
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    let rejectFirst;
    const firstAttempt = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    captchaHarness.getTokenForAction
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce("retry-google-token");
    const googleStart = vi.fn().mockResolvedValue(undefined);
    renderSignUpPage({ googleStart });
    const googleButton = screen.getByRole("button", { name: "Continue with Google" });

    fireEvent.click(googleButton);
    fireEvent.click(googleButton);
    expect(captchaHarness.getTokenForAction).toHaveBeenCalledTimes(1);
    expect(captchaHarness.getTokenForAction).toHaveBeenCalledWith("google_oauth");
    expect(googleButton).toHaveAttribute("aria-busy", "true");

    rejectFirst(new Error("captcha failed"));
    await waitFor(() => expect(googleButton).toHaveAttribute("aria-busy", "false"));
    expect(toast.error).toHaveBeenCalledWith("Please complete the captcha");

    fireEvent.click(googleButton);
    await waitFor(() => {
      expect(captchaHarness.getTokenForAction).toHaveBeenCalledTimes(2);
      expect(googleStart).toHaveBeenCalledWith("retry-google-token");
    });
    expect(googleStart).not.toHaveBeenCalledWith("credential-token");
  });
});

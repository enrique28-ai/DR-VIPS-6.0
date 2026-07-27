import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-hot-toast";
import { beforeEach, describe, expect, test, vi } from "vitest";
import LoginPage from "./LoginPage.jsx";
import { useAuthStore } from "../../stores/authStore.js";

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
        "auth.login.button": "Log in",
        "auth.login.divider": "or",
        "auth.login.emailLabel": "Email",
        "auth.login.emailPlaceholder": "you@example.com",
        "auth.login.errors.captcha": "Please complete the captcha",
        "auth.login.forgotLink": "Forgot password?",
        "auth.login.google": "Continue with Google",
        "auth.login.noAccount": "Do not have an account?",
        "auth.login.passwordLabel": "Password",
        "auth.login.registerLink": "Sign up",
        "auth.login.title": "Log in",
      }[key] ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const renderLoginPage = ({
  isLoading = false,
  login = vi.fn().mockResolvedValue({ role: "doctor" }),
  googleStart = vi.fn().mockResolvedValue(undefined),
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    login,
    googleStart,
  });

  const view = render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

  return {
    ...view,
    emailInput: () => screen.getByPlaceholderText("you@example.com"),
    form: () => view.container.querySelector("form"),
    googleStart,
    login,
    passwordInput: () => view.container.querySelector('input[type="password"]'),
  };
};

const fillLoginForm = (
  view,
  email = "person@example.com",
  password = "Secret1!",
) => {
  fireEvent.change(view.emailInput(), { target: { value: email } });
  fireEvent.change(view.passwordInput(), { target: { value: password } });
};

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(captchaHarness.config, {
      enabled: false,
      provider: "recaptcha",
      siteKey: "recaptcha-site-key",
      isSupportedProvider: true,
      isValid: true,
    });
    captchaHarness.widgetProps = null;
    captchaHarness.getTokenForAction.mockResolvedValue("google-token");
  });

  test("renders the login form, auth links, and Google button", () => {
    const view = renderLoginPage();

    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(view.emailInput()).toHaveValue("");
    expect(view.passwordInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    const googleButton = screen.getByRole("button", { name: "Continue with Google" });
    expect(googleButton).toBeInTheDocument();
    expect(googleButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  test("typing email and password updates both inputs", () => {
    const view = renderLoginPage();

    fillLoginForm(view);

    expect(view.emailInput()).toHaveValue("person@example.com");
    expect(view.passwordInput()).toHaveValue("Secret1!");
  });

  test("submit calls login with email, password, and no captcha token by default", async () => {
    const login = vi.fn().mockResolvedValue({ role: "doctor" });
    const view = renderLoginPage({ login });

    fillLoginForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("person@example.com", "Secret1!", undefined);
    });
  });

  test("failed login does not render a local error", async () => {
    const login = vi.fn().mockRejectedValue(new Error("bad login"));
    const view = renderLoginPage({ login });

    fillLoginForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(login).toHaveBeenCalled();
    });
    expect(screen.queryByText("bad login")).not.toBeInTheDocument();
  });

  test("loading state marks the login button busy and disabled", () => {
    renderLoginPage({ isLoading: true });

    const submitButton = screen.getByRole("button", { name: "Log in" });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
  });

  test("Google button calls googleStart with no captcha token by default", async () => {
    const googleStart = vi.fn().mockResolvedValue(undefined);
    renderLoginPage({ googleStart });

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(googleStart).toHaveBeenCalledWith(undefined);
    });
  });

  test("does not render the ReCAPTCHA widget in the default captcha-disabled environment", () => {
    renderLoginPage();

    expect(screen.queryByTestId("captcha-widget")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith("Please complete the captcha");
  });

  test("preserves reCAPTCHA token compatibility for login and Google auth", async () => {
    captchaHarness.config.enabled = true;
    const login = vi.fn().mockResolvedValue({ role: "doctor" });
    const googleStart = vi.fn().mockResolvedValue(undefined);
    const view = renderLoginPage({ login, googleStart });

    expect(screen.getByTestId("captcha-widget")).toHaveAttribute("data-action", "login");
    fireEvent.click(screen.getByTestId("captcha-widget"));
    fillLoginForm(view);
    fireEvent.submit(view.form());

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith(
        "person@example.com",
        "Secret1!",
        "credential-token",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(googleStart).toHaveBeenCalledWith("credential-token"));
    expect(captchaHarness.getTokenForAction).not.toHaveBeenCalled();
  });

  test("uses the Turnstile login action, forwards its credential token, and resets after failure", async () => {
    Object.assign(captchaHarness.config, {
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const login = vi.fn().mockRejectedValue(new Error("bad login"));
    const view = renderLoginPage({ login });

    expect(captchaHarness.widgetProps.action).toBe("login");
    fireEvent.click(screen.getByTestId("captcha-widget"));
    fillLoginForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        "person@example.com",
        "Secret1!",
        "credential-token",
      );
      expect(captchaHarness.reset).toHaveBeenCalledTimes(1);
    });
  });

  test("deduplicates pending Turnstile Google clicks and allows retry with a separate google_oauth token", async () => {
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
    renderLoginPage({ googleStart });
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

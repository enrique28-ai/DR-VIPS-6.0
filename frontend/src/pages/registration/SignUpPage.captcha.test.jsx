import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const captchaState = vi.hoisted(() => ({
  language: "en",
  mountCount: 0,
  reset: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  googleStart: vi.fn(),
  isLoading: false,
  signup: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../components/forms/CaptchaWidget.jsx", async () => {
  const React = await vi.importActual("react");
  const CaptchaWidget = React.forwardRef(function CaptchaWidget(props, ref) {
    const { onTokenChange, size, language } = props;
    React.useEffect(() => { onTokenChange(""); }, [onTokenChange, size, language]);
    React.useImperativeHandle(ref, () => ({ reset: captchaState.reset, getTokenForAction: async () => "google-action-token" }));
    return (
      <button
        type="button"
        data-testid="captcha-stub"
        data-language={props.language}
        data-size={props.size}
        onClick={() => props.onTokenChange("captcha-token")}
      >
        captcha
      </button>
    );
  });
  return { default: CaptchaWidget };
});

vi.mock("react-hot-toast", () => ({ toast: { error: vi.fn() } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: captchaState.language },
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
      })[key] ?? key,
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: () => authState,
}));

let SignUpPage;
let mediaListener;
let mediaQuery;

beforeAll(async () => {
  vi.stubEnv("VITE_CAPTCHA_ENABLED", "true");
  vi.stubEnv("VITE_CAPTCHA_PROVIDER", "turnstile");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "synthetic-public-site-key");
  SignUpPage = (await import("./SignUpPage.jsx")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  captchaState.language = "en";
  mediaListener = undefined;
  mediaQuery = {
    matches: false,
    addEventListener: vi.fn((_event, listener) => {
      mediaListener = listener;
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback();
    return 1;
  });
  authState.isLoading = false;
  authState.signup = vi.fn().mockResolvedValue({ role: "doctor" });
  authState.googleStart = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );

const completeCaptchaAndForm = () => {
  fireEvent.click(screen.getByTestId("captcha-stub"));
  fireEvent.change(screen.getByPlaceholderText("Dr Person"), {
    target: { value: "Dr Person" },
  });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "doctor@example.com" },
  });
  fireEvent.change(document.querySelector('input[type="password"]'), {
    target: { value: "Abcdef1!" },
  });
};

describe("SignUpPage responsive CAPTCHA", () => {
  test("uses compact CAPTCHA on mobile in a centered full-width wrapper", () => {
    renderPage();

    const captcha = screen.getByTestId("captcha-stub");
    expect(captcha).toHaveAttribute("data-size", "compact");
    expect(captcha.parentElement).toHaveClass("w-full", "justify-center");
  });

  test("uses normal CAPTCHA on desktop", () => {
    mediaQuery.matches = true;
    renderPage();

    expect(screen.getByTestId("captcha-stub")).toHaveAttribute(
      "data-size",
      "normal",
    );
  });

  test("viewport changes reset CAPTCHA tokens and listener cleanup runs", () => {
    const view = renderPage();
    completeCaptchaAndForm();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();

    act(() => mediaListener({ matches: true }));
    expect(screen.getByTestId("captcha-stub")).toHaveAttribute(
      "data-size",
      "normal",
    );
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("captcha-stub"));
    expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();

    const registeredListener = mediaListener;
    view.unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      registeredListener,
    );
  });

  test("submits the unchanged signup payload with token and role", async () => {
    renderPage();
    completeCaptchaAndForm();
    fireEvent.click(screen.getByRole("radio", { name: "Patient" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() =>
      expect(authState.signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        "captcha-token",
        "patient",
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith("/verify-email");
  });

  test("failed signup resets CAPTCHA and Google auth requests a separate action token", async () => {
    authState.signup = vi.fn().mockRejectedValue(new Error("bad signup"));
    renderPage();
    completeCaptchaAndForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(captchaState.reset).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("captcha-stub"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(authState.googleStart).toHaveBeenCalledWith("google-action-token"),
    );
  });
});

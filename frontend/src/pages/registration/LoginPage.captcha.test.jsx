import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const captchaState = vi.hoisted(() => ({
  language: "en",
  mountCount: 0,
  reset: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  googleStart: vi.fn(),
  isLoading: false,
  login: vi.fn(),
}));

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
      })[key] ?? key,
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: () => authState,
}));

let LoginPage;
let mediaListener;
let mediaQuery;

beforeAll(async () => {
  vi.stubEnv("VITE_CAPTCHA_ENABLED", "true");
  vi.stubEnv("VITE_CAPTCHA_PROVIDER", "turnstile");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "synthetic-public-site-key");
  LoginPage = (await import("./LoginPage.jsx")).default;
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
  authState.isLoading = false;
  authState.login = vi.fn().mockResolvedValue({ role: "doctor" });
  authState.googleStart = vi.fn().mockResolvedValue(undefined);
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

const completeCaptchaAndForm = () => {
  fireEvent.click(screen.getByTestId("captcha-stub"));
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "person@example.com" },
  });
  fireEvent.change(document.querySelector('input[type="password"]'), {
    target: { value: "Secret1!" },
  });
};

describe("LoginPage responsive CAPTCHA", () => {
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

  test("viewport and language changes reset CAPTCHA tokens and cleanup the listener", () => {
    const view = renderPage();
    fireEvent.click(screen.getByTestId("captcha-stub"));
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();

    act(() => mediaListener({ matches: true }));
    const desktopCaptcha = screen.getByTestId("captcha-stub");
    expect(desktopCaptcha).toHaveAttribute("data-size", "normal");
    expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled();
    fireEvent.click(desktopCaptcha);
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();

    captchaState.language = "es";
    view.rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("captcha-stub")).toHaveAttribute(
      "data-language",
      "es",
    );
    expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled();

    const registeredListener = mediaListener;
    view.unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      registeredListener,
    );
  });

  test("submits the unchanged login payload with the CAPTCHA token", async () => {
    renderPage();
    completeCaptchaAndForm();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(authState.login).toHaveBeenCalledWith(
        "person@example.com",
        "Secret1!",
        "captcha-token",
      ),
    );
  });

  test("failed login resets CAPTCHA and Google auth requests a separate action token", async () => {
    authState.login = vi.fn().mockRejectedValue(new Error("bad login"));
    renderPage();
    completeCaptchaAndForm();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(captchaState.reset).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("captcha-stub"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(authState.googleStart).toHaveBeenCalledWith("google-action-token"),
    );
  });
});

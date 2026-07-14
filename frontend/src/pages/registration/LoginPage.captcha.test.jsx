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

vi.mock("react-google-recaptcha", async () => {
  const React = await vi.importActual("react");
  const ReCAPTCHA = React.forwardRef(function ReCAPTCHA(props, ref) {
    const [instance] = React.useState(() => ++captchaState.mountCount);
    React.useImperativeHandle(ref, () => ({ reset: captchaState.reset }));
    return (
      <button
        type="button"
        data-testid="recaptcha-stub"
        data-instance={instance}
        data-language={props.hl}
        data-size={props.size}
        onClick={() => props.onChange("captcha-token")}
      >
        captcha
      </button>
    );
  });
  return { default: ReCAPTCHA };
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
  fireEvent.click(screen.getByTestId("recaptcha-stub"));
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

    const captcha = screen.getByTestId("recaptcha-stub");
    expect(captcha).toHaveAttribute("data-size", "compact");
    expect(captcha.parentElement).toHaveClass("w-full", "justify-center");
  });

  test("uses normal CAPTCHA on desktop", () => {
    mediaQuery.matches = true;
    renderPage();

    expect(screen.getByTestId("recaptcha-stub")).toHaveAttribute(
      "data-size",
      "normal",
    );
  });

  test("viewport and language changes remount CAPTCHA and cleanup the listener", () => {
    const view = renderPage();
    fireEvent.click(screen.getByTestId("recaptcha-stub"));
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
    const firstInstance = screen.getByTestId("recaptcha-stub").dataset.instance;

    act(() => mediaListener({ matches: true }));
    const desktopCaptcha = screen.getByTestId("recaptcha-stub");
    expect(desktopCaptcha).toHaveAttribute("data-size", "normal");
    expect(desktopCaptcha.dataset.instance).not.toBe(firstInstance);
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();

    const desktopInstance = desktopCaptcha.dataset.instance;
    captchaState.language = "es";
    view.rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("recaptcha-stub")).toHaveAttribute(
      "data-language",
      "es",
    );
    expect(screen.getByTestId("recaptcha-stub").dataset.instance).not.toBe(
      desktopInstance,
    );

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

  test("failed login resets CAPTCHA and Google auth keeps the same token", async () => {
    authState.login = vi.fn().mockRejectedValue(new Error("bad login"));
    renderPage();
    completeCaptchaAndForm();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(captchaState.reset).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("recaptcha-stub"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(authState.googleStart).toHaveBeenCalledWith("captcha-token"),
    );
  });
});

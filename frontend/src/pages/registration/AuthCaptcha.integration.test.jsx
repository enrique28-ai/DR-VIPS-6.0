import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import { TURNSTILE_SCRIPT_URL } from "../../components/forms/CaptchaWidget.jsx";
import LoginPage from "./LoginPage.jsx";
import SignUpPage from "./SignUpPage.jsx";

const auth = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), googleStart: vi.fn(), isLoading: false }));
vi.mock("../../stores/authStore.js", () => ({ useAuthStore: () => auth }));
vi.mock("../../lib/captchaConfig.js", () => ({ captchaConfig: {
  enabled: true, provider: "turnstile", siteKey: "synthetic-public-key", isSupportedProvider: true, isValid: true,
} }));
vi.mock("react-hot-toast", () => ({ toast: { error: vi.fn() } }));

let turnstile;
beforeEach(() => {
  vi.clearAllMocks();
  auth.login.mockResolvedValue({ role: "doctor" });
  auth.signup.mockResolvedValue({ role: "patient" });
  auth.googleStart.mockResolvedValue(undefined);
  let sequence = 0;
  const frames = new Map();
  turnstile = {
    render: vi.fn((container, { action }) => {
      const id = `widget-${++sequence}`;
      const frame = document.createElement("iframe");
      frame.title = `Turnstile ${action}`;
      container.append(frame);
      frames.set(id, frame);
      return id;
    }),
    execute: vi.fn(), reset: vi.fn(),
    remove: vi.fn((id) => {
      frames.get(id)?.remove();
      frames.delete(id);
    }),
  };
  window.turnstile = turnstile;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", callback => { callback(); return 1; });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
});
afterEach(() => {
  delete window.turnstile;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderForm(kind, language, { waitForCaptcha = true } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: "en", resources: { en: { translation: en }, es: { translation: es } }, interpolation: { escapeValue: false } });
  const Page = kind === "login" ? LoginPage : SignUpPage;
  const catalog = language === "es" ? es : en;
  const strings = catalog.auth[kind];
  const view = render(<I18nextProvider i18n={i18n}><MemoryRouter><Page /></MemoryRouter></I18nextProvider>);
  fireEvent.change(screen.getByPlaceholderText(strings.emailPlaceholder), { target: { value: "synthetic@example.test" } });
  fireEvent.change(view.container.querySelector('input[type="password"]'), { target: { value: "Abcdef1!" } });
  if (kind === "signup") fireEvent.change(screen.getByPlaceholderText(strings.usernamePlaceholder), { target: { value: "Synthetic Person" } });
  if (waitForCaptcha) await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
  return { ...view, i18n, catalog, strings, submit: screen.getByRole("button", { name: strings.button }) };
}

describe("Login Google CAPTCHA handoff", () => {
  async function startGoogle(view) {
    expect(screen.getByTitle("Turnstile login")).toBeVisible();
    const password = turnstile.render.mock.calls[0][1];
    act(() => password.callback("original-password-token"));
    expect(view.submit).toBeEnabled();

    const button = screen.getByRole("button", { name: view.strings.google });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(turnstile.execute).toHaveBeenCalledExactlyOnceWith("widget-2"));
    expect(turnstile.render).toHaveBeenCalledTimes(2);
    expect(turnstile.remove).toHaveBeenCalledExactlyOnceWith("widget-1");
    expect(turnstile.remove.mock.invocationCallOrder[0]).toBeLessThan(turnstile.render.mock.invocationCallOrder[1]);
    expect(screen.queryByTitle("Turnstile login")).not.toBeInTheDocument();
    expect(screen.getByTitle("Turnstile google_oauth")).toBeVisible();
    expect(view.submit).toBeDisabled();
    expect(button).toBeDisabled();
    return { button, password, google: turnstile.render.mock.calls[1][1] };
  }

  test("removes both widgets in order and sends only the Google token to OAuth initiation", async () => {
    let finishGoogle;
    auth.googleStart.mockReturnValueOnce(new Promise((resolve) => { finishGoogle = resolve; }));
    const view = await renderForm("login", "en");
    const { button, google } = await startGoogle(view);
    expect(auth.googleStart).not.toHaveBeenCalled();
    await act(async () => google.callback("google-only-token"));
    expect(auth.googleStart).toHaveBeenCalledExactlyOnceWith("google-only-token");
    expect(turnstile.remove).toHaveBeenLastCalledWith("widget-2");
    expect(screen.queryByTitle(/Turnstile /)).not.toBeInTheDocument();
    expect(button).toBeDisabled();
    await act(async () => finishGoogle());
  });

  test.each(["error-callback", "expired-callback", "timeout-callback", "OAuth initiation failure"])(
    "restores fresh password verification after %s",
    async (failure) => {
      const view = await renderForm("login", "en");
      const { button, password, google } = await startGoogle(view);

      act(() => password.callback("removed-password-token"));
      fireEvent.submit(view.container.querySelector("form"));
      expect(auth.login).not.toHaveBeenCalled();

      if (failure === "OAuth initiation failure") {
        auth.googleStart.mockRejectedValueOnce(new Error("OAuth initiation rejected"));
        act(() => google.callback("google-only-token"));
        await waitFor(() => expect(auth.googleStart).toHaveBeenCalledExactlyOnceWith("google-only-token"));
      } else {
        act(() => google[failure]());
        expect(auth.googleStart).not.toHaveBeenCalled();
      }

      await waitFor(() => expect(screen.getByTitle("Turnstile login")).toBeVisible());
      expect(screen.queryByTitle("Turnstile google_oauth")).not.toBeInTheDocument();
      expect(turnstile.remove).toHaveBeenLastCalledWith("widget-2");
      expect(button).toBeEnabled();
      expect(view.submit).toBeDisabled();
      fireEvent.submit(view.container.querySelector("form"));
      expect(auth.login).not.toHaveBeenCalled();

      const restored = turnstile.render.mock.calls[2][1];
      expect(restored.action).toBe("login");
      act(() => restored.callback("fresh-password-token"));
      fireEvent.click(view.submit);
      expect(auth.login).toHaveBeenCalledExactlyOnceWith("synthetic@example.test", "Abcdef1!", "fresh-password-token");
    },
  );

  test("language changes cancel Google verification and stale callbacks cannot settle its retry", async () => {
    const view = await renderForm("login", "en");
    const { google } = await startGoogle(view);
    await act(async () => { await view.i18n.changeLanguage("es"); });
    await waitFor(() => expect(screen.getByTitle("Turnstile login")).toBeVisible());
    expect(turnstile.remove).toHaveBeenLastCalledWith("widget-2");

    fireEvent.click(screen.getByRole("button", { name: es.auth.login.google }));
    await waitFor(() => expect(turnstile.execute).toHaveBeenLastCalledWith("widget-4"));
    expect(screen.queryByTitle("Turnstile login")).not.toBeInTheDocument();
    await act(async () => google.callback("obsolete-google-token"));
    expect(auth.googleStart).not.toHaveBeenCalled();
    expect(screen.getByTitle("Turnstile google_oauth")).toBeVisible();

    const retry = turnstile.render.mock.calls[3][1];
    expect(retry.language).toBe("es");
    view.unmount();
    await act(async () => retry.callback("late-google-token"));
    expect(turnstile.remove).toHaveBeenLastCalledWith("widget-4");
    expect(screen.queryByTitle(/Turnstile /)).not.toBeInTheDocument();
    expect(auth.googleStart).not.toHaveBeenCalled();
  });

  test("unmounting during script load leaves neither widget behind", async () => {
    delete window.turnstile;
    const view = await renderForm("login", "en", { waitForCaptcha: false });
    const script = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    expect(script).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: view.strings.google }));
    view.unmount();

    window.turnstile = turnstile;
    await act(async () => fireEvent.load(script));
    script.remove();
    expect(turnstile.render).not.toHaveBeenCalled();
    expect(turnstile.execute).not.toHaveBeenCalled();
    expect(auth.googleStart).not.toHaveBeenCalled();
  });
});

for (const kind of ["login", "signup"]) {
  for (const language of ["en", "es"]) {
    describe(`${kind} real CAPTCHA integration in ${language}`, () => {
      test("pending/interaction/expiry/retry and bad credentials never bypass the token gate", async () => {
        const method = auth[kind];
        method.mockRejectedValueOnce(new Error("Synthetic bad credentials"));
        const view = await renderForm(kind, language);
        const options = turnstile.render.mock.calls[0][1];
        expect(options).toMatchObject({ action: kind === "login" ? "login" : "register", execution: "render", appearance: "always", size: "compact" });
        expect(view.submit).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(view.catalog.auth.captcha.pending);
        expect(screen.getByRole("status")).toHaveClass("sr-only");
        fireEvent.submit(view.container.querySelector("form"));
        expect(method).not.toHaveBeenCalled();
        act(() => options["before-interactive-callback"]());
        expect(screen.getByRole("status")).toHaveTextContent(view.catalog.auth.captcha.interactive);
        expect(screen.getByRole("status")).toHaveClass("sr-only");
        expect(view.submit).toBeDisabled();
        act(() => options.callback("first-credential-token"));
        expect(view.submit).toBeEnabled();
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
        act(() => options["expired-callback"]());
        expect(view.submit).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(view.catalog.auth.captcha.expired);
        expect(screen.getByRole("status")).not.toHaveClass("sr-only");
        fireEvent.submit(view.container.querySelector("form"));
        expect(method).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: view.catalog.auth.captcha.retry }));
        expect(screen.getByRole("group", { name: "Cloudflare Turnstile" })).toHaveFocus();
        await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
        expect(view.submit).toBeDisabled();
        act(() => options.callback("obsolete-credential-token"));
        expect(view.submit).toBeDisabled();
        const retried = turnstile.render.mock.calls[1][1];
        act(() => retried.callback("retry-credential-token"));
        fireEvent.submit(view.container.querySelector("form"));
        await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
        expect(method.mock.calls[0]).toContain("retry-credential-token");
        await waitFor(() => expect(turnstile.reset).toHaveBeenCalledWith("widget-2"));
        expect(view.submit).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(view.catalog.auth.captcha.pending);
        act(() => retried.callback("fresh-after-credentials-token"));
        expect(view.submit).toBeEnabled();
      });

      test("Google requires its own token, independently of the pending password widget", async () => {
        const view = await renderForm(kind, language);
        const googleButton = screen.getByRole("button", { name: view.strings.google });
        expect(view.submit).toBeDisabled();
        fireEvent.click(googleButton);
        fireEvent.click(googleButton);
        await waitFor(() => expect(turnstile.execute).toHaveBeenCalledTimes(1));
        expect(turnstile.render).toHaveBeenCalledTimes(2);
        const googleOptions = turnstile.render.mock.calls[1][1];
        expect(googleOptions).toMatchObject({ action: "google_oauth", execution: "execute", appearance: "interaction-only" });
        expect(googleButton).toHaveAttribute("aria-busy", "true");
        expect(auth.googleStart).not.toHaveBeenCalled();
        act(() => googleOptions.callback("independent-google-token"));
        await waitFor(() => expect(auth.googleStart).toHaveBeenCalledExactlyOnceWith("independent-google-token"));
        expect(view.submit).toBeDisabled();
        expect(auth[kind]).not.toHaveBeenCalled();
      });
    });
  }
}

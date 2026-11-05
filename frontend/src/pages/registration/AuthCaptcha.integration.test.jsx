import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
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
  turnstile = {
    render: vi.fn(() => `widget-${++sequence}`),
    execute: vi.fn(), reset: vi.fn(), remove: vi.fn(),
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

async function renderForm(kind, language) {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: "en", resources: { en: { translation: en }, es: { translation: es } }, interpolation: { escapeValue: false } });
  const Page = kind === "login" ? LoginPage : SignUpPage;
  const catalog = language === "es" ? es : en;
  const strings = catalog.auth[kind];
  const view = render(<I18nextProvider i18n={i18n}><MemoryRouter><Page /></MemoryRouter></I18nextProvider>);
  fireEvent.change(screen.getByPlaceholderText(strings.emailPlaceholder), { target: { value: "synthetic@example.test" } });
  fireEvent.change(view.container.querySelector('input[type="password"]'), { target: { value: "Abcdef1!" } });
  if (kind === "signup") fireEvent.change(screen.getByPlaceholderText(strings.usernamePlaceholder), { target: { value: "Synthetic Person" } });
  await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
  return { ...view, catalog, strings, submit: screen.getByRole("button", { name: strings.button }) };
}

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

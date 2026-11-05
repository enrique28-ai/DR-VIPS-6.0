import React, { StrictMode, createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const widgetHarness = vi.hoisted(() => ({
  config: {
    enabled: false,
    provider: "turnstile",
    siteKey: "turnstile-site-key",
    isSupportedProvider: true,
    isValid: true,
  },
}));

vi.mock("../../lib/captchaConfig.js", () => ({
  captchaConfig: widgetHarness.config,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => ({
    "auth.captcha.pending": "Verifying your connection securely...",
    "auth.captcha.interactive": "Complete the security check to continue.",
    "auth.captcha.error": "Security verification failed. Please try again.",
    "auth.captcha.expired": "Security verification expired. Please verify again.",
    "auth.captcha.retry": "Retry security check",
  })[key] ?? key }),
}));

import CaptchaWidget, { TURNSTILE_SCRIPT_URL } from "./CaptchaWidget.jsx";

function setConfig(overrides = {}) {
  Object.assign(widgetHarness.config, {
    enabled: false,
    provider: "turnstile",
    siteKey: "turnstile-site-key",
    isSupportedProvider: true,
    isValid: true,
    ...overrides,
  });
}

function makeTurnstile() {
  let nextId = 0;
  return {
    execute: vi.fn(),
    remove: vi.fn(),
    render: vi.fn(() => {
      nextId += 1;
      return `widget-${nextId}`;
    }),
    reset: vi.fn(),
  };
}

function scripts() {
  return [...document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`)];
}

beforeEach(() => {
  setConfig();
  delete window.turnstile;
  for (const script of scripts()) script.remove();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.turnstile;
  for (const script of scripts()) script.remove();
});

describe("CaptchaWidget", () => {
  test("loads the exact Turnstile script once, shares pending loads, and retries after failure", async () => {
    setConfig({
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const firstError = vi.fn();
    const secondError = vi.fn();
    const first = render(<CaptchaWidget action="login" onError={firstError} />);
    const second = render(<CaptchaWidget action="register" onError={secondError} />);

    expect(scripts()).toHaveLength(1);
    const failedScript = scripts()[0];
    expect(failedScript.src).toBe(TURNSTILE_SCRIPT_URL);
    expect(failedScript.async).toBe(true);
    expect(failedScript.defer).toBe(true);

    fireEvent.error(failedScript);
    await waitFor(() => {
      expect(firstError).toHaveBeenCalledTimes(1);
      expect(secondError).toHaveBeenCalledTimes(1);
    });
    expect(scripts()).toHaveLength(0);
    expect(failedScript.isConnected).toBe(false);
    second.unmount();
    fireEvent.click(first.getByRole("button", { name: "Retry security check" }));
    expect(first.getByRole("status")).toHaveTextContent("Verifying your connection securely...");
    expect(scripts()).toHaveLength(1);
    const retryScript = scripts()[0];
    expect(retryScript).not.toBe(failedScript);

    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    fireEvent.load(retryScript);

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    expect(scripts()).toHaveLength(1);
    first.unmount();
  });

  test("stays inert when disabled and resolves action requests without a token", async () => {
    const ref = createRef();
    const view = render(<CaptchaWidget ref={ref} action="login" />);

    expect(view.container).toBeEmptyDOMElement();
    expect(scripts()).toHaveLength(0);
    await expect(ref.current.getTokenForAction("google_oauth")).resolves.toBeUndefined();
  });

  test("renders exact visible Turnstile options and handles token, failure, reset, and removal", async () => {
    setConfig({
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const ref = createRef();
    const onTokenChange = vi.fn();
    const onError = vi.fn();
    const view = render(
      <CaptchaWidget
        ref={ref}
        action="login"
        language="es"
        size="compact"
        onTokenChange={onTokenChange}
        onError={onError}
      />,
    );

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const options = turnstile.render.mock.calls[0][1];
    expect(options).toEqual({
      sitekey: "turnstile-site-key",
      action: "login",
      language: "es",
      size: "compact",
      theme: "auto",
      execution: "render",
      appearance: "always",
      "response-field": false,
      callback: expect.any(Function),
      "before-interactive-callback": expect.any(Function),
      "after-interactive-callback": expect.any(Function),
      "expired-callback": expect.any(Function),
      "error-callback": expect.any(Function),
      "timeout-callback": expect.any(Function),
    });

    act(() => options.callback("credential-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("credential-token");
    act(() => options["expired-callback"]());
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Captcha expired" }));
    act(() => options.callback("fresh-token"));
    act(() => options["error-callback"]());
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Captcha failed" }));
    act(() => options.callback("another-token"));
    act(() => options["timeout-callback"]());
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Captcha timed out" }));

    act(() => ref.current.reset());
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    view.unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });

  test("deduplicates pending google_oauth execution, supports retry, and rejects pending work on removal", async () => {
    setConfig({
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const ref = createRef();
    const onTokenChange = vi.fn();
    const view = render(
      <CaptchaWidget ref={ref} action="login" onTokenChange={onTokenChange} />,
    );
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    const visibleOptions = turnstile.render.mock.calls[0][1];
    act(() => visibleOptions.callback("credential-token"));
    const first = ref.current.getTokenForAction("google_oauth");
    const duplicate = ref.current.getTokenForAction("google_oauth");
    expect(duplicate).toBe(first);

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    const executionOptions = turnstile.render.mock.calls[1][1];
    expect(executionOptions).toEqual({
      sitekey: "turnstile-site-key",
      action: "google_oauth",
      language: undefined,
      size: "normal",
      theme: "auto",
      execution: "execute",
      appearance: "interaction-only",
      "response-field": false,
      callback: expect.any(Function),
      "expired-callback": expect.any(Function),
      "error-callback": expect.any(Function),
      "timeout-callback": expect.any(Function),
    });
    expect(turnstile.execute).toHaveBeenCalledWith("widget-2");
    act(() => executionOptions.callback("google-token"));
    await expect(first).resolves.toBe("google-token");
    await expect(duplicate).resolves.toBe("google-token");
    expect(onTokenChange).toHaveBeenLastCalledWith("credential-token");

    const failed = ref.current.getTokenForAction("google_oauth");
    const failedExpectation = expect(failed).rejects.toThrow("Captcha failed");
    await waitFor(() => expect(turnstile.reset).toHaveBeenCalledWith("widget-2"));
    act(() => executionOptions["error-callback"]());
    await failedExpectation;

    const retry = ref.current.getTokenForAction("google_oauth");
    act(() => executionOptions.callback("retry-token"));
    await expect(retry).resolves.toBe("retry-token");

    const pending = ref.current.getTokenForAction("google_oauth");
    const pendingExpectation = expect(pending).rejects.toThrow("Captcha widget was removed");
    view.unmount();
    await pendingExpectation;
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(turnstile.remove).toHaveBeenCalledWith("widget-2");
  });

  test("fails closed without a Turnstile site key and never loads the provider script", async () => {
    setConfig({
      enabled: true,
      provider: "turnstile",
      siteKey: "",
      isValid: false,
    });
    const ref = createRef();
    const onError = vi.fn();
    const view = render(<CaptchaWidget ref={ref} action="login" onError={onError} />);

    expect(view.container).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid captcha configuration" }),
      ),
    );
    expect(scripts()).toHaveLength(0);
    await expect(ref.current.getTokenForAction("google_oauth")).rejects.toThrow(
      "Invalid captcha configuration",
    );
  });

  test("is Strict Mode safe and creates only one active Turnstile widget", async () => {
    setConfig({
      enabled: true,
      provider: "turnstile",
      siteKey: "turnstile-site-key",
    });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const view = render(
      <StrictMode>
        <CaptchaWidget action="login" />
      </StrictMode>,
    );

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(turnstile.remove).toHaveBeenCalledTimes(1);
  });
  test("size and language changes remove old Turnstile widgets, clear tokens and ignore obsolete callbacks", async () => {
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const onTokenChange = vi.fn();
    const view = render(<CaptchaWidget action="login" language="en" size="compact" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const firstOptions = turnstile.render.mock.calls[0][1];
    act(() => firstOptions.callback("first-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("first-token");
    view.rerender(<CaptchaWidget action="login" language="en" size="normal" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(turnstile.render.mock.calls[1][1]).toMatchObject({ language: "en", size: "normal" });
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    act(() => firstOptions.callback("obsolete-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    const secondOptions = turnstile.render.mock.calls[1][1];
    act(() => secondOptions.callback("second-token"));
    view.rerender(<CaptchaWidget action="login" language="es" size="normal" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(3));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-2");
    expect(turnstile.render.mock.calls[2][1]).toMatchObject({ language: "es", size: "normal" });
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    act(() => secondOptions.callback("obsolete-second-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    view.unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-3");
  });

  test("explains automatic and interactive verification without authorizing before a token", async () => {
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const onTokenChange = vi.fn();
    render(<CaptchaWidget action="login" onTokenChange={onTokenChange} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent("Verifying your connection securely...");
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const options = turnstile.render.mock.calls[0][1];
    act(() => options["before-interactive-callback"]());
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent("Complete the security check to continue.");
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    act(() => options["after-interactive-callback"]());
    expect(status).toHaveTextContent("Verifying your connection securely...");
    act(() => options.callback("automatic-token"));
    expect(status).toBeEmptyDOMElement();
    act(() => options["after-interactive-callback"]());
    expect(status).toBeEmptyDOMElement();
    expect(onTokenChange).toHaveBeenLastCalledWith("automatic-token");
  });

  test("expired/error states persist until retry and ignore callbacks from the removed widget", async () => {
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const onTokenChange = vi.fn();
    render(<CaptchaWidget action="register" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const status = screen.getByRole("status");
    expect(status).not.toHaveFocus();
    const oldOptions = turnstile.render.mock.calls[0][1];
    act(() => oldOptions.callback("old-token"));
    act(() => oldOptions["expired-callback"]());
    expect(screen.getByRole("status")).toHaveTextContent("Security verification expired.");
    expect(status).not.toHaveClass("sr-only");
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    const retryButton = screen.getByRole("button", { name: "Retry security check" });
    expect(retryButton).toHaveAttribute("type", "button");
    expect(retryButton).toHaveClass("focus-visible:outline-2");
    retryButton.focus();
    expect(retryButton).toHaveFocus();
    fireEvent.click(retryButton);
    const feedback = screen.getByRole("group", { name: "Cloudflare Turnstile" });
    expect(feedback).toHaveFocus();
    expect(feedback).toHaveAttribute("tabindex", "-1");
    expect(feedback).toHaveClass("focus:outline-2");
    expect(status).not.toHaveFocus();
    expect(status).toHaveClass("group-focus:not-sr-only");
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    act(() => oldOptions.callback("obsolete-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    const newOptions = turnstile.render.mock.calls[1][1];
    act(() => newOptions["error-callback"]());
    expect(screen.getByRole("status")).toHaveTextContent("Security verification failed.");
    expect(status).not.toHaveClass("sr-only");
    act(() => newOptions["after-interactive-callback"]());
    expect(screen.getByRole("status")).toHaveTextContent("Security verification failed.");
  });

  test("retry focuses the visible group and keeps it there after success without stealing later focus", async () => {
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const view = render(<><CaptchaWidget action="login" /><button type="button">Next control</button></>);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    act(() => turnstile.render.mock.calls[0][1]["error-callback"]());
    fireEvent.click(screen.getByRole("button", { name: "Retry security check" }));
    const feedback = screen.getByRole("group", { name: "Cloudflare Turnstile" });
    expect(feedback).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Verifying your connection securely...");
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    const options = turnstile.render.mock.calls[1][1];
    act(() => options.callback("retry-token"));
    expect(feedback).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    const nextControl = screen.getByRole("button", { name: "Next control" });
    nextControl.focus();
    act(() => options["expired-callback"]());
    act(() => options.callback("fresh-token"));
    expect(nextControl).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    view.unmount();
  });

  test("prolonged missing-widget feedback stays fail-closed and clears when the official frame appears", async () => {
    vi.useFakeTimers();
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const observations = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback) { this.callback = callback; observations.push(this); }
      observe(target) { this.target = target; }
      disconnect() {}
    });
    const onTokenChange = vi.fn();
    const view = render(<CaptchaWidget action="login" onTokenChange={onTokenChange} />);
    await act(async () => {});
    const status = screen.getByRole("status");
    let frameHeight = 0;
    observations[0].target.getBoundingClientRect = () => ({ height: frameHeight });
    act(() => vi.advanceTimersByTime(4999));
    expect(status).toHaveClass("sr-only");
    act(() => vi.advanceTimersByTime(1));
    expect(status).not.toHaveClass("sr-only");
    expect(status).toHaveTextContent("Verifying your connection securely...");
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    frameHeight = 65;
    act(() => observations[0].callback());
    expect(status).toHaveClass("sr-only");
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("pending feedback timers and observers cannot leak across rounds, terminal states or unmount", async () => {
    vi.useFakeTimers();
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const observations = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observations.push(this); }
      observe(target) { this.target = target; }
    });
    const view = render(<CaptchaWidget action="login" language="en" />);
    await act(async () => {});
    const status = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(4999));
    view.rerender(<CaptchaWidget action="login" language="es" />);
    await act(async () => {});
    expect(observations[0].disconnect).toHaveBeenCalledTimes(1);
    act(() => observations[0].callback());
    act(() => vi.advanceTimersByTime(1));
    expect(status).toHaveClass("sr-only");
    observations[1].target.getBoundingClientRect = () => ({ height: 65 });
    act(() => vi.advanceTimersByTime(4999));
    expect(status).toHaveClass("sr-only");
    act(() => turnstile.render.mock.calls[1][1].callback("verified-token"));
    expect(observations[1].disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => observations[1].callback());
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveClass("sr-only");
    view.rerender(<CaptchaWidget action="login" language="en" />);
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(observations[2].disconnect).toHaveBeenCalledTimes(1);
    act(() => observations[2].callback());
  });

  test("password retry preserves an independent pending Google action and its token", async () => {
    setConfig({ enabled: true });
    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    const ref = createRef();
    const onTokenChange = vi.fn();
    const view = render(<CaptchaWidget ref={ref} action="login" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const oldVisible = turnstile.render.mock.calls[0][1];
    const google = ref.current.getTokenForAction("google_oauth");
    expect(ref.current.getTokenForAction("google_oauth")).toBe(google);
    await waitFor(() => expect(turnstile.execute).toHaveBeenCalledTimes(1));
    const googleOptions = turnstile.render.mock.calls[1][1];
    act(() => oldVisible["error-callback"]());
    fireEvent.click(screen.getByRole("button", { name: "Retry security check" }));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(3));
    expect(turnstile.remove).not.toHaveBeenCalledWith("widget-2");
    expect(turnstile.execute).toHaveBeenCalledTimes(1);
    act(() => googleOptions.callback("separate-google-token"));
    await expect(google).resolves.toBe("separate-google-token");
    expect(onTokenChange).toHaveBeenLastCalledWith("");
    view.unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-2");
  });

});

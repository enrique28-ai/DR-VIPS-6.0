import React, { StrictMode, createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const widgetHarness = vi.hoisted(() => ({
  config: {
    enabled: false,
    provider: "recaptcha",
    siteKey: "recaptcha-site-key",
    isSupportedProvider: true,
    isValid: true,
  },
  recaptchaProps: null,
  recaptchaReset: vi.fn(),
}));

vi.mock("../../lib/captchaConfig.js", () => ({
  captchaConfig: widgetHarness.config,
}));

vi.mock("react-google-recaptcha", async () => {
  const ReactModule = await vi.importActual("react");
  const ReCAPTCHA = ReactModule.forwardRef(function ReCAPTCHA(props, ref) {
    widgetHarness.recaptchaProps = props;
    ReactModule.useImperativeHandle(ref, () => ({
      reset: widgetHarness.recaptchaReset,
    }));
    return (
      <button
        type="button"
        data-testid="recaptcha-adapter"
        onClick={() => props.onChange("recaptcha-token")}
      >
        reCAPTCHA
      </button>
    );
  });
  return { default: ReCAPTCHA };
});

import CaptchaWidget, { TURNSTILE_SCRIPT_URL } from "./CaptchaWidget.jsx";

function setConfig(overrides = {}) {
  Object.assign(widgetHarness.config, {
    enabled: false,
    provider: "recaptcha",
    siteKey: "recaptcha-site-key",
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
  widgetHarness.recaptchaProps = null;
  widgetHarness.recaptchaReset.mockReset();
  delete window.turnstile;
  for (const script of scripts()) script.remove();
  vi.clearAllMocks();
});

afterEach(() => {
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
    first.unmount();
    second.unmount();

    const retry = render(<CaptchaWidget action="login" />);
    expect(scripts()).toHaveLength(1);
    const retryScript = scripts()[0];
    expect(retryScript).not.toBe(failedScript);

    const turnstile = makeTurnstile();
    window.turnstile = turnstile;
    fireEvent.load(retryScript);

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    expect(scripts()).toHaveLength(1);
    retry.unmount();
  });

  test("stays inert when disabled and resolves action requests without a token", async () => {
    const ref = createRef();
    const view = render(<CaptchaWidget ref={ref} action="login" />);

    expect(view.container).toBeEmptyDOMElement();
    expect(scripts()).toHaveLength(0);
    await expect(ref.current.getTokenForAction("google_oauth")).resolves.toBeUndefined();
  });

  test("preserves the reCAPTCHA adapter token, callbacks, reset, and action compatibility", async () => {
    setConfig({ enabled: true });
    const ref = createRef();
    const onTokenChange = vi.fn();
    const onError = vi.fn();
    render(
      <CaptchaWidget
        ref={ref}
        action="login"
        language="es"
        size="compact"
        onTokenChange={onTokenChange}
        onError={onError}
      />,
    );

    expect(widgetHarness.recaptchaProps).toMatchObject({
      sitekey: "recaptcha-site-key",
      hl: "es",
      size: "compact",
    });
    await expect(ref.current.getTokenForAction("google_oauth")).rejects.toThrow(
      "Missing captcha",
    );

    fireEvent.click(screen.getByTestId("recaptcha-adapter"));
    expect(onTokenChange).toHaveBeenLastCalledWith("recaptcha-token");
    await expect(ref.current.getTokenForAction("google_oauth")).resolves.toBe(
      "recaptcha-token",
    );

    act(() => ref.current.reset());
    expect(widgetHarness.recaptchaReset).toHaveBeenCalledTimes(1);
    expect(onTokenChange).toHaveBeenLastCalledWith("");

    act(() => widgetHarness.recaptchaProps.onExpired());
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Captcha expired" }));
    act(() => widgetHarness.recaptchaProps.onErrored());
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Captcha failed" }));
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
});

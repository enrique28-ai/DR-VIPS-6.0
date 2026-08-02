import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { captchaConfig } from "../../lib/captchaConfig.js";

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise;

function loadTurnstileScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }

  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  const loadPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const fail = (error) => {
      cleanup();
      script.remove();
      if (turnstileScriptPromise === loadPromise) {
        turnstileScriptPromise = undefined;
      }
      reject(error);
    };
    const handleLoad = () => {
      if (window.turnstile) {
        cleanup();
        resolve(window.turnstile);
      } else {
        fail(new Error("Turnstile did not initialize"));
      }
    };
    const handleError = () => {
      fail(new Error("Turnstile script failed to load"));
    };

    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  });
  turnstileScriptPromise = loadPromise;

  return turnstileScriptPromise;
}

const CaptchaWidget = forwardRef(function CaptchaWidget(
  {
    action,
    language,
    size = "normal",
    onTokenChange,
    onError,
  },
  ref,
) {
  const recaptchaRef = useRef(null);
  const visibleContainerRef = useRef(null);
  const executionContainerRef = useRef(null);
  const visibleWidgetIdRef = useRef(null);
  const executionWidgetIdRef = useRef(null);
  const visibleTokenRef = useRef("");
  const executionRef = useRef(null);
  const mountedRef = useRef(false);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);

  onTokenChangeRef.current = onTokenChange;
  onErrorRef.current = onError;

  const publishToken = useCallback((token) => {
    visibleTokenRef.current = token || "";
    onTokenChangeRef.current?.(visibleTokenRef.current);
  }, []);

  const reportVisibleFailure = useCallback((error) => {
    publishToken("");
    onErrorRef.current?.(error instanceof Error ? error : new Error("Captcha failed"));
  }, [publishToken]);

  const settleExecution = useCallback((kind, value) => {
    const pending = executionRef.current;
    if (!pending) return;
    executionRef.current = null;
    if (kind === "resolve") pending.resolve(value);
    else pending.reject(value instanceof Error ? value : new Error("Captcha failed"));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!captchaConfig.enabled || captchaConfig.provider !== "turnstile") {
      return undefined;
    }

    let active = true;
    publishToken("");

    if (!captchaConfig.isValid) {
      reportVisibleFailure(new Error("Invalid captcha configuration"));
      return () => {
        active = false;
      };
    }

    loadTurnstileScript()
      .then((turnstile) => {
        if (!active || !visibleContainerRef.current) return;

        visibleWidgetIdRef.current = turnstile.render(visibleContainerRef.current, {
          sitekey: captchaConfig.siteKey,
          action,
          language,
          size,
          theme: "auto",
          execution: "render",
          appearance: "always",
          "response-field": false,
          callback: (token) => {
            if (active && mountedRef.current) publishToken(token);
          },
          "expired-callback": () => {
            if (active && mountedRef.current) reportVisibleFailure(new Error("Captcha expired"));
          },
          "error-callback": () => {
            if (active && mountedRef.current) reportVisibleFailure(new Error("Captcha failed"));
          },
          "timeout-callback": () => {
            if (active && mountedRef.current) reportVisibleFailure(new Error("Captcha timed out"));
          },
        });
      })
      .catch((error) => {
        if (active && mountedRef.current) reportVisibleFailure(error);
      });

    return () => {
      active = false;
      publishToken("");
      const turnstile = window.turnstile;
      if (turnstile && visibleWidgetIdRef.current !== null) {
        turnstile.remove(visibleWidgetIdRef.current);
        visibleWidgetIdRef.current = null;
      }
      if (turnstile && executionWidgetIdRef.current !== null) {
        turnstile.remove(executionWidgetIdRef.current);
        executionWidgetIdRef.current = null;
      }
      settleExecution("reject", new Error("Captcha widget was removed"));
    };
  }, [action, language, publishToken, reportVisibleFailure, settleExecution, size]);

  useImperativeHandle(ref, () => ({
    reset() {
      publishToken("");
      if (captchaConfig.provider === "recaptcha") {
        recaptchaRef.current?.reset();
        return;
      }
      if (captchaConfig.provider === "turnstile" && visibleWidgetIdRef.current !== null) {
        window.turnstile?.reset(visibleWidgetIdRef.current);
      }
    },

    getTokenForAction(requestedAction) {
      if (!captchaConfig.enabled) return Promise.resolve(undefined);
      if (!captchaConfig.isValid) {
        return Promise.reject(new Error("Invalid captcha configuration"));
      }
      if (captchaConfig.provider === "recaptcha") {
        return visibleTokenRef.current
          ? Promise.resolve(visibleTokenRef.current)
          : Promise.reject(new Error("Missing captcha"));
      }
      if (executionRef.current) return executionRef.current.promise;

      const promise = new Promise((resolve, reject) => {
        executionRef.current = { promise: null, resolve, reject };
      });
      executionRef.current.promise = promise;

      loadTurnstileScript()
        .then((turnstile) => {
          if (!mountedRef.current || !executionContainerRef.current) {
            throw new Error("Captcha widget is unavailable");
          }

          if (executionWidgetIdRef.current === null) {
            executionWidgetIdRef.current = turnstile.render(executionContainerRef.current, {
              sitekey: captchaConfig.siteKey,
              action: requestedAction,
              language,
              size,
              theme: "auto",
              execution: "execute",
              appearance: "interaction-only",
              "response-field": false,
              callback: (token) => {
                if (mountedRef.current) settleExecution("resolve", token);
              },
              "expired-callback": () => settleExecution("reject", new Error("Captcha expired")),
              "error-callback": () => settleExecution("reject", new Error("Captcha failed")),
              "timeout-callback": () => settleExecution("reject", new Error("Captcha timed out")),
            });
          } else {
            turnstile.reset(executionWidgetIdRef.current);
          }

          turnstile.execute(executionWidgetIdRef.current);
        })
        .catch((error) => settleExecution("reject", error));

      return promise;
    },
  }), [language, publishToken, settleExecution, size]);

  if (!captchaConfig.enabled || !captchaConfig.isValid) return null;

  if (captchaConfig.provider === "recaptcha") {
    return (
      <ReCAPTCHA
        key={`${language}-${size}`}
        ref={recaptchaRef}
        sitekey={captchaConfig.siteKey}
        hl={language}
        size={size}
        onChange={publishToken}
        onExpired={() => reportVisibleFailure(new Error("Captcha expired"))}
        onErrored={() => reportVisibleFailure(new Error("Captcha failed"))}
      />
    );
  }

  return (
    <div>
      <div ref={visibleContainerRef} />
      <div ref={executionContainerRef} />
    </div>
  );
});

export default CaptchaWidget;

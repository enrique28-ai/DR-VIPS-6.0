import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
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
    suspendVisible = false,
    onTokenChange,
    onError,
  },
  ref,
) {
  const { t } = useTranslation();
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [showPendingFallback, setShowPendingFallback] = useState(false);
  const feedbackRef = useRef(null);
  const visibleContainerRef = useRef(null);
  const executionContainerRef = useRef(null);
  const visibleWidgetIdRef = useRef(null);
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

  const reportVisibleFailure = useCallback((error, status = "error") => {
    publishToken("");
    setVerificationStatus(status);
    onErrorRef.current?.(error instanceof Error ? error : new Error("Captcha failed"));
  }, [publishToken]);

  const settleExecution = useCallback((attempt, kind, value) => {
    if (!attempt || executionRef.current !== attempt) return;
    executionRef.current = null;
    try {
      attempt.remove?.();
    } finally {
      if (kind === "resolve") attempt.resolve(value);
      else attempt.reject(value instanceof Error ? value : new Error("Captcha failed"));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShowPendingFallback(false);
    if (suspendVisible || !captchaConfig.enabled || !captchaConfig.isValid || verificationStatus !== "pending") {
      return undefined;
    }

    const container = visibleContainerRef.current;
    let active = true;
    let delayElapsed = false;
    const updateFallback = () => {
      if (active) {
        setShowPendingFallback(delayElapsed && (!container || container.getBoundingClientRect().height === 0));
      }
    };
    const timeout = setTimeout(() => {
      delayElapsed = true;
      updateFallback();
    }, 5000);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateFallback) : null;
    if (container) observer?.observe(container);

    return () => {
      active = false;
      clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [action, language, retryAttempt, size, suspendVisible, verificationStatus]);

  useLayoutEffect(() => {
    if (suspendVisible || !captchaConfig.enabled || captchaConfig.provider !== "turnstile") {
      return undefined;
    }

    let active = true;
    publishToken("");
    setVerificationStatus("pending");

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
            if (active && mountedRef.current) {
              publishToken(token);
              setVerificationStatus(token ? "verified" : "error");
            }
          },
          "before-interactive-callback": () => {
            if (active && mountedRef.current) {
              publishToken("");
              setVerificationStatus("interactive");
            }
          },
          "after-interactive-callback": () => {
            if (active && mountedRef.current) {
              setVerificationStatus((status) => status === "interactive" ? "pending" : status);
            }
          },
          "expired-callback": () => {
            if (active && mountedRef.current) reportVisibleFailure(new Error("Captcha expired"), "expired");
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
    };
  }, [action, language, publishToken, reportVisibleFailure, retryAttempt, size, suspendVisible]);

  // A password-widget retry must not cancel an independent Google OAuth check.
  useLayoutEffect(() => () => {
    settleExecution(executionRef.current, "reject", new Error("Captcha widget was removed"));
  }, [action, language, settleExecution, size]);

  useImperativeHandle(ref, () => ({
    reset() {
      publishToken("");
      setVerificationStatus("pending");
      if (captchaConfig.provider === "turnstile" && visibleWidgetIdRef.current !== null) {
        window.turnstile?.reset(visibleWidgetIdRef.current);
      }
    },

    getTokenForAction(requestedAction) {
      if (!captchaConfig.enabled) return Promise.resolve(undefined);
      if (!captchaConfig.isValid) {
        return Promise.reject(new Error("Invalid captcha configuration"));
      }
      const pending = executionRef.current;
      if (pending) {
        return pending.action === requestedAction
          ? pending.promise
          : Promise.reject(new Error("Another captcha action is pending"));
      }

      const attempt = { action: requestedAction, remove: null };
      attempt.promise = new Promise((resolve, reject) => {
        attempt.resolve = resolve;
        attempt.reject = reject;
      });
      executionRef.current = attempt;

      loadTurnstileScript()
        .then((turnstile) => {
          if (executionRef.current !== attempt) return;
          if (!mountedRef.current || !executionContainerRef.current) {
            throw new Error("Captcha widget is unavailable");
          }

          // A new widget binds all callbacks to this attempt, including after retries.
          const widgetId = turnstile.render(executionContainerRef.current, {
            sitekey: captchaConfig.siteKey,
            action: requestedAction,
            language,
            size,
            theme: "auto",
            execution: "execute",
            appearance: "interaction-only",
            "response-field": false,
            callback: (token) => settleExecution(attempt, "resolve", token),
            "expired-callback": () => settleExecution(attempt, "reject", new Error("Captcha expired")),
            "error-callback": () => settleExecution(attempt, "reject", new Error("Captcha failed")),
            "timeout-callback": () => settleExecution(attempt, "reject", new Error("Captcha timed out")),
          });
          if (!widgetId) throw new Error("Captcha widget is unavailable");
          if (executionRef.current !== attempt) {
            turnstile.remove(widgetId);
            return;
          }
          attempt.remove = () => turnstile.remove(widgetId);
          turnstile.execute(widgetId);
        })
        .catch((error) => settleExecution(attempt, "reject", error));

      return attempt.promise;
    },
  }), [language, publishToken, settleExecution, size]);

  if (!captchaConfig.enabled || !captchaConfig.isValid) return null;

  return (
    <div ref={feedbackRef} tabIndex={-1} role="group" aria-label="Cloudflare Turnstile" className="group w-full text-sm text-slate-600 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500">
      {!suspendVisible && (
        <>
          <p role="status" aria-live="polite" aria-atomic="true" className={verificationStatus === "error" || verificationStatus === "expired" || showPendingFallback ? undefined : "sr-only group-focus:not-sr-only"}>
            {verificationStatus !== "verified" ? t(`auth.captcha.${verificationStatus}`) : ""}
          </p>
          {(verificationStatus === "error" || verificationStatus === "expired") && (
            <button
              type="button"
              className="mt-2 min-h-11 rounded-lg px-3 font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => {
                publishToken("");
                setVerificationStatus("pending");
                setRetryAttempt((attempt) => attempt + 1);
                feedbackRef.current?.focus();
              }}
            >
              {t("auth.captcha.retry")}
            </button>
          )}
        </>
      )}
      <div ref={visibleContainerRef} className="flex w-full justify-center" />
      <div ref={executionContainerRef} />
    </div>
  );
});

export default CaptchaWidget;

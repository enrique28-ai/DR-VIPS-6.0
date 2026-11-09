// Notifications are hints only. Never put identity, credentials or medical data here.
export const SESSION_CHANGE_KEY = "drvips-session-change";
let announced = false;
let returnRound = null;
const eventRounds = new WeakMap();

export function sessionEventKey(event) {
  if (!event) return undefined;
  if (eventRounds.has(event)) return eventRounds.get(event);
  const returning = event.type === "focus" || event.type === "visibilitychange" ||
    (event.type === "pageshow" && event.persisted);
  const key = returning && returnRound ? returnRound : event;
  eventRounds.set(event, key);
  // Keep this event's key for every listener, but the next tab activation is new.
  if (event.type === "pageshow" && event.persisted) returnRound = null;
  return key;
}

export function announceSessionChange() {
  announced = true;
  try {
    const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random()}`;
    window.localStorage.setItem(SESSION_CHANGE_KEY, nonce);
  } catch {
    // Storage can be unavailable; returning to the tab still revalidates.
  }
}

export function announceInitialSession() {
  if (!announced) announceSessionChange();
}

export function observeSessionChanges(revalidate) {
  let away = document.visibilityState === "hidden";
  const request = (event) => {
    try {
      void Promise.resolve(revalidate(event)).catch(() => {});
    } catch {
      // The auth store owns failure handling; event handlers must not reject.
    }
  };
  const onStorage = (event) => {
    if (event.key === SESSION_CHANGE_KEY && event.newValue && event.newValue !== event.oldValue) request(event);
  };
  const onBlur = () => { away = true; };
  const onHide = () => {
    // Mark a new document return without changing the DOM or making a request.
    returnRound = {};
    away = true;
  };
  const onFocus = (event) => {
    if (away && document.visibilityState !== "hidden") {
      away = false;
      request(event);
    }
  };
  const onVisibility = (event) => {
    if (document.visibilityState === "hidden") away = true;
    else onFocus(event);
  };
  const onShow = (event) => {
    if (event.persisted) {
      away = document.visibilityState === "hidden";
      request(event);
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onShow);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onShow);
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onVisibility);
    returnRound = null;
  };
}

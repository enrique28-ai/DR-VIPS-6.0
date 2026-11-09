import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let sync;
const stops = [];
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sync = await import("./sessionSync.js");
});
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); });
const observe = (callback = vi.fn()) => { stops.push(sync.observeSessionChanges(callback)); return callback; };

describe("session-change hints", () => {
  test("stores only a nonce and announces authenticated startup once", () => {
    sync.announceInitialSession();
    const first = localStorage.getItem(sync.SESSION_CHANGE_KEY);
    expect(typeof first).toBe("string");
    expect(first).not.toBe("");
    expect(first).not.toMatch(/user|doctor|patient|email|token|cookie|password/i);
    sync.announceInitialSession();
    expect(localStorage.getItem(sync.SESSION_CHANGE_KEY)).toBe(first);
    sync.announceSessionChange();
    expect(localStorage.getItem(sync.SESSION_CHANGE_KEY)).not.toBe(first);
  });

  test("an explicit cookie-change announcement prevents a duplicate startup announcement", () => {
    sync.announceSessionChange();
    const first = localStorage.getItem(sync.SESSION_CHANGE_KEY);
    sync.announceInitialSession();
    expect(localStorage.getItem(sync.SESSION_CHANGE_KEY)).toBe(first);
  });

  test("ignores persisted user data, deleted hints and repeated values", () => {
    const callback = observe();
    window.dispatchEvent(new StorageEvent("storage", { key: "drvips-auth", newValue: "untrusted-state" }));
    window.dispatchEvent(new StorageEvent("storage", { key: sync.SESSION_CHANGE_KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: sync.SESSION_CHANGE_KEY, oldValue: "same", newValue: "same" }));
    expect(callback).not.toHaveBeenCalled();
    const event = new StorageEvent("storage", { key: sync.SESSION_CHANGE_KEY, newValue: "synthetic-hint" });
    window.dispatchEvent(event);
    expect(callback).toHaveBeenCalledExactlyOnceWith(event);
  });

  test.each(["visible-first", "focus-first"])("coalesces %s activation even after the first validation settles", async (order) => {
    const callback = observe(vi.fn().mockResolvedValue(undefined));
    const visibility = vi.spyOn(document, "visibilityState", "get");
    window.dispatchEvent(new Event("focus"));
    expect(callback).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("blur"));
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    const first = order === "visible-first" ? () => document.dispatchEvent(new Event("visibilitychange")) : () => window.dispatchEvent(new Event("focus"));
    const second = order === "visible-first" ? () => window.dispatchEvent(new Event("focus")) : () => document.dispatchEvent(new Event("visibilitychange"));
    first();
    await Promise.resolve();
    second();
    expect(callback).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test("persisted pageshow revalidates once and consumes the return-to-tab focus", () => {
    const callback = observe();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("pageshow"));
    expect(callback).not.toHaveBeenCalled();
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    window.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledExactlyOnceWith(event);
  });

  test.each(["activation-first", "pageshow-first"])("pagehide gives %s return events one key even after the first validation settles", async (order) => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const keys = [];
    observe((event) => { keys.push(sync.sessionEventKey(event)); return Promise.resolve(); });
    const oldKey = sync.sessionEventKey(new Event("focus"));
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(keys).toHaveLength(0);
    visibility.mockReturnValue("visible");
    const shown = new Event("pageshow");
    Object.defineProperty(shown, "persisted", { value: true });
    if (order === "activation-first") document.dispatchEvent(new Event("visibilitychange"));
    else window.dispatchEvent(shown);
    await Promise.resolve();
    if (order === "activation-first") window.dispatchEvent(shown);
    else document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).not.toBe(oldKey);
    expect(sync.sessionEventKey(shown)).toBe(keys[0]);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(keys.at(-1)).not.toBe(keys[0]);
  });

  test("a hidden restored document still validates again when it becomes visible", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const keys = [];
    observe((event) => { keys.push(sync.sessionEventKey(event)); });
    window.dispatchEvent(new Event("pagehide"));
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    expect(keys).toHaveLength(1);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  test("new document returns and storage hints never reuse a previous return's key", () => {
    observe();
    window.dispatchEvent(new Event("pagehide"));
    const first = sync.sessionEventKey(new Event("focus"));
    const hint = sync.sessionEventKey(new StorageEvent("storage", { key: sync.SESSION_CHANGE_KEY, newValue: "synthetic-new-hint" }));
    expect(hint).not.toBe(first);
    window.dispatchEvent(new Event("pagehide"));
    expect(sync.sessionEventKey(new Event("focus"))).not.toBe(first);
  });

  test("storage failure preserves focus fallback and cleanup removes every listener", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Synthetic storage restriction"); });
    expect(() => sync.announceSessionChange()).not.toThrow();
    const callback = observe();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledTimes(1);
    stops.pop()();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new StorageEvent("storage", { key: sync.SESSION_CHANGE_KEY, newValue: "synthetic-hint" }));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("event callback failures remain handled", async () => {
    const callback = observe(vi.fn().mockRejectedValue(new Error("Synthetic validation failure")));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

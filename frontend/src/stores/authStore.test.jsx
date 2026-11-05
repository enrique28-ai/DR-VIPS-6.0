import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), clear: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../lib/axios.js", () => ({ default: mocks }));
vi.mock("../lib/queryClient.js", () => ({ queryClient: { clear: mocks.clear } }));
vi.mock("react-hot-toast", () => ({ default: { success: mocks.success, error: mocks.error } }));
vi.mock("../i18n", () => ({ default: { t: (key) => key } }));
const user = { _id: "synthetic-doctor", role: "doctor", isVerified: true };
const other = { ...user, _id: "synthetic-other" };
const response = (value = user) => ({ data: { user: value } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let store;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/patients");
  for (const method of [mocks.get, mocks.post, mocks.put, mocks.delete]) method.mockReset();
  mocks.post.mockResolvedValue({ data: {} });
  mocks.get.mockResolvedValue(response());
  store = (await import("./authStore.js")).useAuthStore;
});
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

describe("real auth store ownership", () => {
  test("shares the exact Promise for concurrent checks; a later round is fresh", async () => {
    const gate = deferred(); mocks.get.mockReturnValueOnce(gate.promise);
    const first = store.getState().checkAuth();
    expect(store.getState().checkAuth()).toBe(first);
    await tick(); expect(mocks.get).toHaveBeenCalledTimes(1);
    gate.resolve(response()); await first;
    await store.getState().checkAuth();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  test.each(["app-first", "guard-first"])("settled %s bootstrap is shared without a TTL", async (order) => {
    const options = { location: { pathname: "/patients", key: "default" }, guard: Symbol() };
    await store.getState().checkAuth(order === "app-first" ? undefined : options);
    await store.getState().checkAuth(order === "app-first" ? options : undefined);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await store.getState().checkAuth({ ...options, guard: Symbol() });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  test("stale success cannot restore auth after immediately coalesced logout", async () => {
    const gate = deferred(); mocks.get.mockReturnValueOnce(gate.promise);
    const old = store.getState().checkAuth(); await tick();
    const logout = store.getState().logout();
    expect(store.getState().logout()).toBe(logout);
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false });
    await logout; gate.resolve(response());
    expect(await old).toMatchObject({ status: "superseded" });
    expect(store.getState().user).toBeNull();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
  test.each(["success", "failure"])("old startup %s cannot overwrite a new login", async (completion) => {
    const gate = deferred(); mocks.get.mockReturnValueOnce(gate.promise).mockResolvedValue(response(other));
    const old = store.getState().checkAuth(); await tick();
    await store.getState().login("synthetic@example.test", "Password1!");
    if (completion === "success") gate.resolve(response()); else gate.reject({ response: { status: 401 } });
    await old; expect(store.getState().user).toEqual(other);
  });
  test("an old finalizer cannot clear a newer pending validation", async () => {
    const oldGate = deferred(), nextGate = deferred();
    mocks.get.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const old = store.getState().checkAuth(); await tick();
    const next = store.getState().checkAuth({ fresh: true }); await tick();
    oldGate.reject(new Error("network")); await old;
    expect(store.getState().isCheckingAuth).toBe(true);
    nextGate.resolve(response()); await next;
    expect(store.getState().isCheckingAuth).toBe(false);
  });
  test.each([
    [401, "unauthenticated"], [403, "unavailable"], [429, "unavailable"], [500, "unavailable"],
    [undefined, "unavailable"], ["ECONNABORTED", "unavailable"], ["ERR_CANCELED", "unavailable"],
  ])("fails closed for %s without rejecting bootstrap", async (status, outcome) => {
    store.setState({ user, isAuthenticated: true });
    mocks.get.mockRejectedValue(typeof status === "number" ? { response: { status } } : { code: status });
    expect(await store.getState().checkAuth()).toMatchObject({ status: outcome });
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  test.each([null, {}, { role: "doctor" }, { ...user, isVerified: undefined }])("rejects malformed user %j", async (value) => {
    mocks.get.mockResolvedValue(response(value));
    expect(await store.getState().checkAuth()).toMatchObject({ status: "unavailable" });
    expect(store.getState().isAuthenticated).toBe(false);
  });
  test.each(["updateProfile", "uploadAvatar", "importAvatarByUrl"])("fences stale %s snapshot", async (action) => {
    const gate = deferred();
    if (action === "importAvatarByUrl") mocks.post.mockReturnValueOnce(gate.promise);
    else mocks.put.mockReturnValueOnce(gate.promise);
    const old = store.getState()[action](action === "uploadAvatar" ? new File(["x"], "avatar.png") : {});
    const rejected = expect(old).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    mocks.get.mockResolvedValue(response(other));
    await store.getState().login("other@example.test", "Password1!");
    gate.resolve(response()); await rejected;
    expect(store.getState().user).toEqual(other);
  });
  test("orders delayed logout before a newer login cookie write", async () => {
    const gate = deferred(); mocks.post.mockReturnValueOnce(gate.promise);
    const logout = store.getState().logout();
    const old = expect(logout).resolves.toBeUndefined();
    await tick();
    const login = store.getState().login("new@example.test", "Password1!");
    await tick(); expect(mocks.post).toHaveBeenCalledTimes(1);
    gate.resolve({ data: {} }); await old; await login;
    expect(mocks.post.mock.calls.map(([url]) => url)).toEqual(["/auth/logout", "/auth/login"]);
    expect(store.getState().isAuthenticated).toBe(true);
  });
  test("failed verification preserves the form session; a 401 invalidates it", async () => {
    const unverified = { ...user, isVerified: false };
    store.setState({ user: unverified, isAuthenticated: true, isCheckingAuth: false });
    mocks.post.mockRejectedValueOnce({ response: { status: 400 } });
    await expect(store.getState().verifyEmail("wrong")).rejects.toMatchObject({ response: { status: 400 } });
    expect(store.getState()).toMatchObject({ user: unverified, isAuthenticated: true, isCheckingAuth: false });
    mocks.post.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(store.getState().verifyEmail("expired")).rejects.toMatchObject({ response: { status: 401 } });
    expect(store.getState().user).toBeNull();
  });
  test("persists only user and isAuthenticated", async () => {
    await store.getState().checkAuth();
    expect(Object.keys(JSON.parse(localStorage.getItem("drvips-auth")).state).sort()).toEqual(["isAuthenticated", "user"]);
  });
  test("fresh restoration waits for a mutation then performs post-restore validation", async () => {
    const gate = deferred(); mocks.post.mockReturnValueOnce(gate.promise);
    const login = store.getState().login("synthetic@example.test", "Password1!");
    const restored = store.getState().checkAuth({ fresh: true });
    gate.resolve({ data: {} }); await login; await restored;
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(store.getState().isCheckingAuth).toBe(false);
  });
  test("a failed required validation prevents a delayed profile snapshot reinserting user", async () => {
    store.setState({ user, isAuthenticated: true, isCheckingAuth: false });
    const gate = deferred(); mocks.put.mockReturnValueOnce(gate.promise);
    const update = store.getState().updateProfile({});
    const rejected = expect(update).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    mocks.get.mockRejectedValue({ response: { status: 401 } });
    await store.getState().checkAuth();
    gate.resolve(response()); await rejected;
    expect(store.getState().user).toBeNull();
  });
  test("successful reset invalidates old session and settles checking", async () => {
    store.setState({ user, isAuthenticated: true, isCheckingAuth: false });
    await store.getState().resetPassword("synthetic-token", "Password1!");
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false, isLoading: false });
  });
  test("failed account deletion preserves normal authenticated failure state", async () => {
    store.setState({ user, isAuthenticated: true, isCheckingAuth: false });
    mocks.delete.mockRejectedValue({ response: { status: 500 } });
    await expect(store.getState().deleteMe()).rejects.toMatchObject({ response: { status: 500 } });
    expect(store.getState()).toMatchObject({ user, isAuthenticated: true, isCheckingAuth: false, isLoading: false });
  });
  test.each(["signup", "verifyEmail", "finalizeGoogleRole"])("%s uses fresh post-write validation", async (action) => {
    const old = deferred(); mocks.get.mockReturnValueOnce(old.promise).mockResolvedValue(response(other));
    const startup = store.getState().checkAuth(); await tick();
    await store.getState()[action]("synthetic");
    old.resolve(response()); await startup;
    expect(store.getState().user).toEqual(other);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  test("real interceptor ignores a delayed API 401 after real-store login", async () => {
    const { default: client } = await vi.importActual("../lib/axios.js");
    let reject;
    client.defaults.adapter = (config) => new Promise((_yes, no) => { reject = () => no({ config, response: { status: 401 } }); });
    const request = client.get("/patients");
    const failure = expect(request).rejects.toMatchObject({ response: { status: 401 } });
    mocks.get.mockResolvedValue(response(other));
    await store.getState().login("new@example.test", "Password1!");
    reject(); await failure;
    expect(store.getState().user).toEqual(other);
    expect(mocks.post.mock.calls.map(([url]) => url)).toEqual(["/auth/login"]);
  });
  test("real interceptor invalidates same-identity API 401 despite a newer successful /me", async () => {
    const { default: client } = await vi.importActual("../lib/axios.js");
    await store.getState().checkAuth();
    let reject, error;
    client.defaults.adapter = (config) => new Promise((_yes, no) => {
      error = { config, response: { status: 401 } }; reject = () => no(error);
    });
    const request = client.get("/patients");
    const failure = expect(request).rejects.toBe(error);
    await store.getState().checkAuth();
    reject(); await failure;
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  test("failed reset during bootstrap cannot strand checking or trust hydration", async () => {
    const gate = deferred(); mocks.get.mockReturnValueOnce(gate.promise);
    store.setState({ user, isAuthenticated: true });
    const startup = store.getState().checkAuth(); await tick();
    mocks.post.mockRejectedValue({ response: { status: 400 } });
    await expect(store.getState().resetPassword("bad", "Password1!")).rejects.toMatchObject({ response: { status: 400 } });
    gate.resolve(response()); await startup;
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
  });

  test.each(["verifyEmail", "resetPassword", "deleteMe"])("required navigation after failed %s must validate again", async (action) => {
    await store.getState().checkAuth();
    const mutation = deferred(), validation = deferred();
    (action === "deleteMe" ? mocks.delete : mocks.post).mockReturnValueOnce(mutation.promise);
    const operation = store.getState()[action]("synthetic", "Password1!");
    const failed = expect(operation).rejects.toMatchObject({ response: { status: 400 } });
    const check = store.getState().checkAuth({ location: { pathname: "/calendar", key: "new" }, guard: Symbol() });
    expect(store.getState().checkAuth()).toBe(check);
    mocks.get.mockReturnValueOnce(validation.promise);
    mutation.reject({ response: { status: 400 } }); await failed; await tick();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(store.getState().isCheckingAuth).toBe(true);
    validation.reject({ response: { status: 401 } }); await check;
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
  });

  test.each([false, true])("a superseded mutation waiter cannot reauthenticate after failed logout, fresh=%s", async (fresh) => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise).mockRejectedValueOnce(new Error("logout unavailable"));
    const verification = store.getState().verifyEmail("synthetic");
    const supersededVerification = expect(verification).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    await tick();
    const waiter = store.getState().checkAuth({ fresh, location: { pathname: "/calendar", key: "next" }, guard: Symbol() });
    const logout = store.getState().logout();
    gate.resolve({ data: {} });
    await supersededVerification; await logout;
    expect(await waiter).toMatchObject({ status: "superseded" });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
  });
  test.each([false, true])("a check waiting on explicit logout cannot undo local logout, fresh=%s", async (fresh) => {
    await store.getState().checkAuth();
    const gate = deferred(); mocks.post.mockReturnValueOnce(gate.promise);
    const logout = store.getState().logout();
    const waiter = store.getState().checkAuth({ fresh });
    gate.reject(new Error("logout unavailable")); await logout;
    expect(await waiter).toMatchObject({ status: "unauthenticated" });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
  });

});

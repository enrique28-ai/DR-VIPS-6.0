import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), clear: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../lib/axios.js", () => ({ default: mocks }));
vi.mock("../lib/queryClient.js", () => ({ queryClient: { clear: mocks.clear, getQueryCache: () => ({ findAll: () => [] }), removeQueries: vi.fn() } }));
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
  sessionStorage.clear();
  window.history.replaceState({}, "", "/patients");
  for (const method of [mocks.get, mocks.post, mocks.put, mocks.delete]) method.mockReset();
  mocks.post.mockResolvedValue({ data: {} });
  mocks.get.mockResolvedValue(response());
  store = (await import("./authStore.js")).useAuthStore;
});
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

describe("real auth store ownership", () => {
  test.each(["uploadAvatar", "importAvatarByUrl"])("publishes the confirmed %s photo over an older same-account read", async (action) => {
    const previous = { ...user, avatar: "https://res.cloudinary.com/synthetic/old.png" };
    const updated = { ...user, avatar: "https://res.cloudinary.com/synthetic/new.png" };
    mocks.get.mockResolvedValueOnce(response(previous));
    await store.getState().checkAuth();
    const staleRead = deferred();
    mocks.get.mockReturnValueOnce(staleRead.promise);
    const validation = store.getState().checkAuth({ fresh: true });
    await tick();

    if (action === "uploadAvatar") {
      const file = new File(["synthetic"], "avatar.png", { type: "image/png" });
      mocks.put.mockResolvedValueOnce(response(updated));
      await expect(store.getState().uploadAvatar(file)).resolves.toEqual(updated);
      const [path, payload, config] = mocks.put.mock.calls[0];
      expect(path).toBe("/auth/profile/avatar");
      expect(payload.get("avatar")).toBe(file);
      expect(config.headers["Content-Type"]).toBe("multipart/form-data");
    } else {
      mocks.post.mockResolvedValueOnce(response(updated));
      await expect(store.getState().importAvatarByUrl("https://images.example.test/avatar.png")).resolves.toEqual(updated);
      expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/auth/profile/avatar-url", { url: "https://images.example.test/avatar.png" });
    }
    staleRead.resolve(response(previous));
    expect(await validation).toMatchObject({ user: updated });
    expect(store.getState().user).toEqual(updated);
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("auth.toasts.photoUpdated");
    mocks.get.mockResolvedValueOnce(response({ ...updated, avatar: "" }));
    await store.getState().checkAuth({ fresh: true });
    expect(store.getState().user.avatar).toBe("");
  });

  test.each([
    [{ response: { status: 429 } }, "auth.toasts.rateLimitedShort"],
    [{ response: { status: 422, data: { errorCode: "AVATAR_URL_UNAVAILABLE", error: "private detail" } } }, "auth.profile.errors.avatarUrlUnavailable"],
    [{ response: { status: 504, data: { errorCode: "AVATAR_TIMEOUT" } } }, "auth.profile.errors.avatarTimeout"],
    [{ code: "ECONNABORTED" }, "auth.profile.errors.avatarTimeout"],
    [{ response: { status: 502, data: { error: "private detail" } } }, "auth.toasts.importFailed"],
  ])("keeps the previous avatar and reports a localized import failure %#", async (error, key) => {
    const previous = { ...user, avatar: "https://res.cloudinary.com/synthetic/old.png" };
    mocks.get.mockResolvedValueOnce(response(previous));
    await store.getState().checkAuth();
    mocks.post.mockRejectedValueOnce(error);
    await expect(store.getState().importAvatarByUrl("https://images.example.test/avatar.png")).rejects.toBe(error);
    expect(store.getState().user).toEqual(previous);
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(key);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  test("a successful response without a persisted photo does not announce success", async () => {
    const previous = { ...user, avatar: "https://res.cloudinary.com/synthetic/old.png" };
    mocks.get.mockResolvedValueOnce(response(previous));
    await store.getState().checkAuth();
    mocks.post.mockResolvedValueOnce(response(user));
    await expect(store.getState().importAvatarByUrl("https://images.example.test/avatar.png")).rejects.toThrow();
    expect(store.getState().user).toEqual(previous);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  test.each([new Error("Synthetic offline"), { code: "ECONNABORTED" }])("unconfirmed logout blocks automatic recovery and refresh until a new login succeeds (%s)", async (error) => {
    await store.getState().checkAuth();
    mocks.post.mockRejectedValueOnce(error);
    await store.getState().logout();
    const reads = mocks.get.mock.calls.length;
    for (const type of ["focus", "visibilitychange", "pageshow", "storage"]) {
      expect(await store.getState().syncSession({ event: new Event(type) })).toMatchObject({ status: "unauthenticated" });
    }
    expect(mocks.get).toHaveBeenCalledTimes(reads);
    vi.resetModules();
    store = (await import("./authStore.js")).useAuthStore;
    expect(await store.getState().checkAuth()).toMatchObject({ status: "unauthenticated" });
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
    expect(mocks.get).toHaveBeenCalledTimes(reads);

    mocks.post.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(store.getState().login("synthetic", "wrong-password")).rejects.toMatchObject({ response: { status: 401 } });
    expect(await store.getState().checkAuth()).toMatchObject({ status: "unauthenticated" });
    expect(mocks.get).toHaveBeenCalledTimes(reads);
    mocks.get.mockResolvedValueOnce(response(other));
    await expect(store.getState().login("synthetic", "synthetic-password")).resolves.toEqual(other);
    expect(sessionStorage.getItem("drvips-logout-unconfirmed")).toBeNull();
    expect(store.getState().user).toEqual(other);
  });

  test("a profile response for a different identity is not published before authoritative synchronization", async () => {
    await store.getState().checkAuth();
    const validation = deferred();
    mocks.put.mockResolvedValueOnce(response(other));
    mocks.get.mockReturnValueOnce(validation.promise);
    await expect(store.getState().updateProfile({})).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    expect(store.getState()).toMatchObject({ user, isCheckingAuth: true });
    validation.resolve(response(other));
    await store.getState().checkAuth();
    expect(store.getState().user).toEqual(other);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  test("a restored document honors logout intent written by a later document in the same tab", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.get.mockReturnValueOnce(gate.promise);
    const old = store.getState().checkAuth({ fresh: true });
    await tick();
    sessionStorage.setItem("drvips-logout-unconfirmed", "1");
    const event = Object.assign(new Event("pageshow"), { persisted: true });
    expect(await store.getState().syncSession({ event })).toMatchObject({ status: "unauthenticated" });
    gate.resolve(response());
    await expect(old).resolves.toMatchObject({ status: "superseded" });
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  test.each(["login", "signup", "finalizeGoogleRole"])("%s announces the shared cookie only after its HTTP write succeeds", async (action) => {
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise);
    const operation = store.getState()[action]("synthetic", "synthetic-credential");
    await tick();
    expect(localStorage.getItem("drvips-session-change")).toBeNull();
    gate.resolve({ data: {} });
    await operation;
    expect(localStorage.getItem("drvips-session-change")).not.toBeNull();
  });
  test("logout announces only after server acknowledgement, including when superseded by a failed login", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise).mockRejectedValueOnce({ response: { status: 500 } });
    const logout = store.getState().logout();
    await tick();
    const login = store.getState().login("synthetic", "synthetic-credential");
    const failed = expect(login).rejects.toMatchObject({ response: { status: 500 } });
    expect(localStorage.getItem("drvips-session-change")).toBeNull();
    gate.resolve({ data: {} });
    await logout; await failed;
    expect(localStorage.getItem("drvips-session-change")).not.toBeNull();
  });
  test("a superseded successful login still announces its cookie write if the next login fails", async () => {
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise).mockRejectedValueOnce({ response: { status: 500 } });
    const first = store.getState().login("synthetic-b", "synthetic-credential");
    const superseded = expect(first).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    await tick();
    const latest = store.getState().login("synthetic-c", "synthetic-credential");
    const failed = expect(latest).rejects.toMatchObject({ response: { status: 500 } });
    gate.resolve({ data: {} });
    await superseded; await failed;
    expect(localStorage.getItem("drvips-session-change")).not.toBeNull();
  });
  test("the same pageshow event shares one authoritative round across callers", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.get.mockReturnValueOnce(gate.promise);
    const event = new Event("pageshow");
    const first = store.getState().syncSession({ event });
    expect(store.getState().syncSession({ event })).toBe(first);
    expect(store.getState().checkAuth()).toBe(first);
    await tick();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    gate.resolve(response(other));
    await first;
    expect(store.getState().user).toEqual(other);
    expect(store.getState().isCheckingAuth).toBe(false);
  });
  test("a newer hint supersedes an in-flight snapshot instead of briefly publishing its older identity", async () => {
    await store.getState().checkAuth();
    const older = deferred(), latest = deferred();
    mocks.get.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    const first = store.getState().syncSession({ event: new Event("storage") });
    await tick();
    const second = store.getState().syncSession({ event: new Event("storage") });
    await tick();
    older.resolve(response(other));
    expect(await first).toMatchObject({ status: "superseded" });
    expect(store.getState().user).toEqual(user);
    expect(store.getState().isCheckingAuth).toBe(true);
    const newest = { ...user, _id: "synthetic-latest" };
    latest.resolve(response(newest));
    await second;
    expect(store.getState()).toMatchObject({ user: newest, isCheckingAuth: false });
  });
  test("a synchronous hint burst requests only the latest authoritative round", async () => {
    await store.getState().checkAuth();
    const first = store.getState().syncSession({ event: new Event("storage") });
    const second = store.getState().syncSession({ event: new Event("storage") });
    await Promise.all([first, second]);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  test.each(["post", "validation"])("a hint during local login %s preserves cookie ordering and keeps the global gate until a fresh final check", async (phase) => {
    await store.getState().checkAuth();
    const write = deferred(), local = deferred(), peer = deferred();
    mocks.post.mockReturnValueOnce(write.promise);
    mocks.get.mockReturnValueOnce(local.promise).mockReturnValueOnce(peer.promise);
    const login = store.getState().login("synthetic", "synthetic-credential");
    await tick();
    let synchronization;
    if (phase === "post") synchronization = store.getState().syncSession({ event: new Event("storage") });
    write.resolve({ data: {} });
    await tick();
    if (phase === "validation") synchronization = store.getState().syncSession({ event: new Event("storage") });
    local.resolve(response(other));
    await login;
    expect(store.getState().isCheckingAuth).toBe(true);
    await tick();
    expect(mocks.get).toHaveBeenCalledTimes(3);
    peer.resolve(response(other));
    await synchronization;
    expect(store.getState()).toMatchObject({ user: other, isCheckingAuth: false });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });
  test("same-identity synchronization preserves its identity generation and medical cache", async () => {
    await store.getState().checkAuth();
    const { identityGeneration, isCurrentIdentity } = await import("../lib/authSession.js");
    const previous = identityGeneration();
    await store.getState().syncSession({ event: new Event("storage") });
    expect(isCurrentIdentity(previous)).toBe(true);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(store.getState().user).toEqual(user);
  });
  test("a legitimate pending profile write remains usable when synchronization confirms the same account", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.put.mockReturnValueOnce(gate.promise);
    const profile = store.getState().updateProfile({ name: "Synthetic updated name" });
    const completed = expect(profile).resolves.toMatchObject({ _id: user._id, name: "Synthetic updated name" });
    await store.getState().syncSession({ event: new Event("focus") });
    gate.resolve(response({ ...user, name: "Synthetic updated name" }));
    await completed;
    expect(store.getState().user.name).toBe("Synthetic updated name");
  });
  test("an old API 401 during synchronization cannot release its gate or strand a valid replacement account", async () => {
    const { default: client } = await vi.importActual("../lib/axios.js");
    await store.getState().checkAuth();
    let rejectOld;
    client.defaults.adapter = (config) => new Promise((_yes, no) => { rejectOld = () => no({ config, response: { status: 401 } }); });
    const old = client.get("/patients");
    const rejected = expect(old).rejects.toMatchObject({ response: { status: 401 } });
    const replaced = deferred(), current = deferred();
    mocks.get.mockReturnValueOnce(replaced.promise).mockReturnValueOnce(current.promise);
    const synchronization = store.getState().syncSession({ event: new Event("storage") });
    await tick();
    rejectOld(); await rejected;
    expect(store.getState().isCheckingAuth).toBe(true);
    replaced.resolve(response(other));
    await tick();
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(store.getState().isCheckingAuth).toBe(true);
    current.resolve(response(other));
    await synchronization;
    expect(store.getState()).toMatchObject({ user: other, isAuthenticated: true, isCheckingAuth: false });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  test("explicit logout cancels an older synchronization without automatically reauthenticating from its delayed response", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.get.mockReturnValueOnce(gate.promise);
    const synchronization = store.getState().syncSession({ event: new Event("storage") });
    await tick();
    await store.getState().logout();
    gate.resolve(response());
    expect(await synchronization).toMatchObject({ status: "superseded" });
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  test("a current 401 after /me publishes but before synchronization settles cannot strand the auth gate", async () => {
    await store.getState().checkAuth();
    const { identityGeneration } = await import("../lib/authSession.js");
    const generation = identityGeneration();
    const old = deferred(), current = deferred();
    mocks.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const sync = store.getState().syncSession({ event: new Event("focus") });
    const unsubscribe = store.subscribe((state) => {
      if (!state.isCheckingAuth && state.isAuthenticated) {
        unsubscribe();
        state.invalidateSession(generation);
      }
    });
    old.resolve(response());
    await tick();
    expect(store.getState()).toMatchObject({ user: null, isCheckingAuth: true });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    current.resolve(response(other));
    await expect(sync).resolves.toMatchObject({ status: "authenticated", user: other });
    expect(store.getState()).toMatchObject({ user: other, isCheckingAuth: false });
  });
  test.each([401, 500, "network"])("an authoritative synchronization failure %s stays closed without a retry loop", async (status) => {
    await store.getState().checkAuth();
    mocks.get.mockRejectedValueOnce(status === "network" ? new Error("Synthetic network failure") : { response: { status } });
    const result = await store.getState().syncSession({ event: new Event("storage") });
    expect(result.status).toBe(status === 401 ? "unauthenticated" : "unavailable");
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  test("confirmed logout reports success after immediately clearing local identity and cache", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise);
    const logout = store.getState().logout();
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false });
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    gate.resolve({ data: { success: true } });
    await expect(logout).resolves.toBeUndefined();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("auth.toasts.logout");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  test.each([
    ["server", { response: { status: 500 } }],
    ["network", new Error("synthetic network failure")],
    ["timeout", { code: "ECONNABORTED" }],
  ])("failed %s logout stays locally cleared, coalesced and resolved without a success toast", async (_description, error) => {
    await store.getState().checkAuth();
    mocks.post.mockRejectedValueOnce(error);
    const logout = store.getState().logout();
    expect(store.getState().logout()).toBe(logout);
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false });
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    await expect(logout).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({ user: null, isAuthenticated: false, isCheckingAuth: false });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/auth/logout");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("auth.toasts.logoutUnconfirmed");
  });

  test("a failed logout superseded by a newer login cannot publish stale feedback", async () => {
    await store.getState().checkAuth();
    const gate = deferred();
    mocks.post.mockReturnValueOnce(gate.promise);
    const logout = store.getState().logout();
    await tick();
    mocks.get.mockResolvedValue(response(other));
    const login = store.getState().login("other@example.test", "Password1!");
    gate.reject(new Error("synthetic logout failure"));
    await logout;
    await login;
    expect(store.getState().user).toEqual(other);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("auth.toasts.loginSuccess");
  });

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
  test.each(["app-first", "guard-first"])("a hydrated identity replaced by %s bootstrap keeps one shared validation", async (order) => {
    store.setState({ user, isAuthenticated: true });
    const { identityGeneration, isCurrentIdentity } = await import("../lib/authSession.js");
    const previousIdentity = identityGeneration();
    mocks.get.mockResolvedValue(response(other));
    const options = { location: { pathname: "/patients", key: "default" }, guard: Symbol() };
    const first = await store.getState().checkAuth(order === "app-first" ? undefined : options);
    const second = await store.getState().checkAuth(order === "app-first" ? options : undefined);
    expect(first.status).toBe("authenticated");
    expect(second).toBe(first);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(isCurrentIdentity(previousIdentity)).toBe(false);
    expect(store.getState()).toMatchObject({ user: other, isCheckingAuth: false, isLoading: false });
  });
  test.each([401, 500, "network"])("a failed %s restoration clears the former cache and fences its identity before a later success", async (status) => {
    await store.getState().checkAuth();
    const { identityGeneration, isCurrentIdentity } = await import("../lib/authSession.js");
    const previousIdentity = identityGeneration();
    mocks.get.mockRejectedValueOnce(status === "network" ? new Error("Synthetic network failure") : { response: { status } });
    await store.getState().checkAuth({ fresh: true });
    expect(store.getState().user).toBeNull();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(isCurrentIdentity(previousIdentity)).toBe(false);
    mocks.get.mockResolvedValueOnce(response(other));
    await store.getState().checkAuth({ fresh: true });
    expect(store.getState().user).toEqual(other);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
  test.each(["updateProfile", "uploadAvatar", "importAvatarByUrl"])("a server identity replacement fences a pending %s snapshot", async (action) => {
    await store.getState().checkAuth();
    const gate = deferred();
    if (action === "importAvatarByUrl") mocks.post.mockReturnValueOnce(gate.promise);
    else mocks.put.mockReturnValueOnce(gate.promise);
    const old = store.getState()[action](action === "uploadAvatar" ? new File(["x"], "avatar.png") : {});
    const rejected = expect(old).rejects.toMatchObject({ code: "AUTH_SUPERSEDED" });
    mocks.get.mockResolvedValueOnce(response(other));
    await store.getState().checkAuth({ fresh: true });
    gate.resolve(response());
    await rejected;
    expect(store.getState().user).toEqual(other);
    expect(store.getState().isLoading).toBe(false);
  });
  test("the real interceptor ignores an old-identity API 401 after server-side account replacement", async () => {
    const { default: client } = await vi.importActual("../lib/axios.js");
    await store.getState().checkAuth();
    let reject;
    client.defaults.adapter = (config) => new Promise((_yes, no) => { reject = () => no({ config, response: { status: 401 } }); });
    const request = client.get("/patients");
    const failure = expect(request).rejects.toMatchObject({ response: { status: 401 } });
    mocks.get.mockResolvedValueOnce(response(other));
    await store.getState().checkAuth({ fresh: true });
    reject(); await failure;
    expect(store.getState().user).toEqual(other);
    expect(mocks.post).not.toHaveBeenCalled();
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

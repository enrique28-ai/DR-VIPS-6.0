import { beforeEach, afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), error: vi.fn() }));
vi.mock("../lib/axios.js", () => ({ default: { post: mocks.post } }));
vi.mock("../lib/queryClient.js", () => ({ queryClient: { clear: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.error } }));
vi.mock("../i18n", () => ({ default: { t: key => key } }));
let store, location;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  store = (await import("./authStore.js")).useAuthStore;
  location = { href: "https://example.test/login" };
  vi.stubGlobal("window", { location });
});
afterEach(() => vi.unstubAllGlobals());
const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state";
test.each(["token", undefined])("initiates by verified POST then navigates to backend Google URL, token=%s", async token => {
  mocks.post.mockResolvedValue({ data: { url: googleUrl } });
  await store.getState().googleStart(token);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post).toHaveBeenCalledWith("/auth/google/recaptcha", { captchaToken: token });
  expect(location.href).toBe(googleUrl);
});
test("concurrent initiation shares one request and permits retry after failure", async () => {
  let reject;
  mocks.post.mockReturnValue(new Promise((_resolve, no) => { reject = no; }));
  const first = store.getState().googleStart("token");
  expect(store.getState().googleStart("token")).toBe(first);
  const rejected = expect(first).rejects.toEqual({ response: { status: 400, data: { error: "Captcha failed" } } });
  reject({ response: { status: 400, data: { error: "Captcha failed" } } }); await rejected;
  expect(location.href).toBe("https://example.test/login");
  expect(mocks.error).toHaveBeenCalledWith("Captcha failed");
  mocks.post.mockResolvedValue({ data: { url: googleUrl } });
  await store.getState().googleStart("fresh-token"); expect(mocks.post).toHaveBeenCalledTimes(2);
});
test.each(["https://evil.test", "javascript:alert(1)", "https://accounts.google.com.evil.test/o/oauth2/v2/auth", undefined])("rejects unexpected authorization destinations %s", async url => {
  mocks.post.mockResolvedValue({ data: { url } });
  await expect(store.getState().googleStart("token")).rejects.toBeDefined();
  expect(location.href).toBe("https://example.test/login");
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import api from "./axios.js";
import { useAuthStore } from "../stores/authStore.js";

const authMock = vi.hoisted(() => ({
  state: {
    isAuthenticated: false,
    logout: vi.fn(),
  },
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: {
    getState: vi.fn(() => authMock.state),
  },
}));

const originalAdapter = api.defaults.adapter;

const setAuthState = ({ isAuthenticated = false, logout = vi.fn() } = {}) => {
  authMock.state = { isAuthenticated, logout };
  useAuthStore.getState.mockImplementation(() => authMock.state);
  return authMock.state;
};

const headerValue = (headers, name) => {
  if (typeof headers?.get === "function") return headers.get(name);
  return headers?.[name] ?? headers?.[name.toLowerCase()];
};

const useSuccessfulAdapter = () => {
  const adapter = vi.fn(async (config) => ({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }));
  api.defaults.adapter = adapter;
  return adapter;
};

const useRejectingAdapter = (error) => {
  const adapter = vi.fn(() => Promise.reject(error));
  api.defaults.adapter = adapter;
  return adapter;
};

describe("axios client interceptors", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setAuthState();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
    vi.clearAllMocks();
  });

  test("sends the selected language in the x-lang request header", async () => {
    localStorage.setItem("lang", "es");
    const adapter = useSuccessfulAdapter();

    await api.get("/patients");

    const config = adapter.mock.calls[0][0];
    expect(headerValue(config.headers, "x-lang")).toBe("es");
  });

  test("defaults the x-lang request header to en when no language is stored", async () => {
    const adapter = useSuccessfulAdapter();

    await api.get("/patients");

    const config = adapter.mock.calls[0][0];
    expect(headerValue(config.headers, "x-lang")).toBe("en");
  });

  test("logs out authenticated users on non-auth 401 responses", async () => {
    const logout = vi.fn();
    setAuthState({ isAuthenticated: true, logout });
    const error = { config: { url: "/patients" }, response: { status: 401 } };
    useRejectingAdapter(error);

    await expect(api.get("/patients")).rejects.toBe(error);

    expect(useAuthStore.getState).toHaveBeenCalled();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  test("does not log out for 401 responses from auth me", async () => {
    const logout = vi.fn();
    setAuthState({ isAuthenticated: true, logout });
    const error = { config: { url: "/auth/me" }, response: { status: 401 } };
    useRejectingAdapter(error);

    await expect(api.get("/auth/me")).rejects.toBe(error);

    expect(logout).not.toHaveBeenCalled();
  });

  test("does not log out for 401 responses from auth logout", async () => {
    const logout = vi.fn();
    setAuthState({ isAuthenticated: true, logout });
    const error = { config: { url: "/auth/logout" }, response: { status: 401 } };
    useRejectingAdapter(error);

    await expect(api.post("/auth/logout")).rejects.toBe(error);

    expect(logout).not.toHaveBeenCalled();
  });

  test("does not log out for non-401 response errors", async () => {
    const logout = vi.fn();
    setAuthState({ isAuthenticated: true, logout });
    const error = { config: { url: "/patients" }, response: { status: 500 } };
    useRejectingAdapter(error);

    await expect(api.get("/patients")).rejects.toBe(error);

    expect(logout).not.toHaveBeenCalled();
  });

  test("does not log out on 401 responses when the store is not authenticated", async () => {
    const logout = vi.fn();
    setAuthState({ isAuthenticated: false, logout });
    const error = { config: { url: "/patients" }, response: { status: 401 } };
    useRejectingAdapter(error);

    await expect(api.get("/patients")).rejects.toBe(error);

    expect(useAuthStore.getState).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});

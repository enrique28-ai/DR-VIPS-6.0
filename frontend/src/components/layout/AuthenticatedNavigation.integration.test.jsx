import { useEffect, useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "../../App.jsx";
import Navbar from "../Navbar.jsx";
import Sidebar from "./Sidebar.jsx";
import { getNavigation } from "./navigationConfig.js";
import i18n from "../../i18n.js";

const integrationState = vi.hoisted(() => ({
  auth: {
    user: null,
    isAuthenticated: false,
    isCheckingAuth: false,
    checkAuth: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  },
  notifications: {
    data: { items: [], unreadCount: 0 },
    markOne: vi.fn(),
    markAll: vi.fn(),
  },
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: (selector) =>
    selector ? selector(integrationState.auth) : integrationState.auth,
}));

vi.mock("../../features/notifications/nhooks.js", () => ({
  useNotifications: () => ({ data: integrationState.notifications.data }),
  useMarkNotifRead: () => ({ mutate: integrationState.notifications.markOne }),
  useMarkAllNotifsRead: () => ({
    mutate: integrationState.notifications.markAll,
  }),
}));

vi.mock("../../pages/docrecords/MyHealthInfo.jsx", () => ({
  default: () => <div data-testid="app-route-content">My health info page</div>,
}));

vi.mock("../../pages/docrecords/MyChildrenHome.jsx", () => ({
  default: () => <div data-testid="app-route-content">My children page</div>,
}));

const patientUser = {
  name: "Patient Person",
  email: "patient@example.com",
  isVerified: true,
  role: "patient",
};

const doctorUser = {
  name: "Doctor Person",
  email: "doctor@example.com",
  isVerified: true,
  role: "doctor",
};

const setAuthenticatedUser = (user) => {
  integrationState.auth.user = user;
  integrationState.auth.isAuthenticated = true;
  integrationState.auth.isCheckingAuth = false;
};

const setGuest = () => {
  integrationState.auth.user = null;
  integrationState.auth.isAuthenticated = false;
  integrationState.auth.isCheckingAuth = false;
};

function RouteProbe() {
  const location = useLocation();
  return <div data-testid="route-path">{location.pathname}</div>;
}

function IntegratedNavigationLayout() {
  const { user, isAuthenticated, isCheckingAuth, logout } = integrationState.auth;
  const [initialAuthResolved, setInitialAuthResolved] = useState(
    () => !isCheckingAuth,
  );

  useEffect(() => {
    if (!isCheckingAuth) setInitialAuthResolved(true);
  }, [isCheckingAuth]);

  const showSidebar =
    initialAuthResolved &&
    isAuthenticated &&
    user?.isVerified &&
    getNavigation(user?.role).length > 0;

  return (
    <>
      <Navbar />
      <div
        data-testid="navigation-layout"
        className={showSidebar ? "min-h-[calc(100vh-4rem)] lg:flex" : ""}
      >
        <Sidebar
          role={showSidebar ? user.role : undefined}
          user={showSidebar ? user : undefined}
          logout={logout}
        />
        <main data-testid="route-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}

const navigationApp = (initialPath) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route element={<IntegratedNavigationLayout />}>
        <Route path="*" element={<RouteProbe />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderNavigation = (initialPath = "/") => {
  const result = render(navigationApp(initialPath));
  return {
    ...result,
    rerenderNavigation: () => result.rerender(navigationApp(initialPath)),
  };
};

const getSidebarNavigation = (container) => {
  const sidebar = container.querySelector("aside");
  expect(sidebar).not.toBeNull();
  expect(sidebar).toHaveClass("hidden", "lg:flex");
  return within(sidebar).getByRole("navigation", {
    name: "Main navigation",
  });
};

const openDrawer = () => {
  fireEvent.click(screen.getByRole("button", { name: "Main navigation" }));
  return screen.getByRole("dialog", { name: "Main navigation" });
};

const openUserMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  return screen.getByRole("menu");
};

const labelsIn = (navigation) =>
  within(navigation)
    .getAllByRole("link")
    .map((link) => link.textContent.trim());

const expectedLabels = (role) =>
  getNavigation(role).map((item) => i18n.t(item.labelKey));

describe("Authenticated navigation integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem("lang", "en");
    await i18n.changeLanguage("en");
    setGuest();
    integrationState.auth.logout = vi.fn().mockResolvedValue(undefined);
    integrationState.auth.checkAuth.mockClear();
    integrationState.notifications.data = { items: [], unreadCount: 0 };
    document.body.style.overflow = "";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  test("verified patient Sidebar, drawer accounts, and notification control work together without a top UserMenu", () => {
    setAuthenticatedUser(patientUser);
    const { container } = renderNavigation();

    const sidebarNavigation = getSidebarNavigation(container);
    expect(labelsIn(sidebarNavigation)).toEqual([
      "Home",
      "My health state",
      "My health info",
      "My children",
      "Calendar",
      "Profile",
    ]);
    const sidebar = container.querySelector("aside");
    expect(within(sidebar).getByText("Patient Person")).toBeInTheDocument();
    expect(within(sidebar).getByText("patient@example.com")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(sidebarNavigation).getAllByRole("link", { name: "Profile" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Hi\s/)).not.toBeInTheDocument();

    const hamburger = screen.getByRole("button", { name: "Main navigation" });
    expect(hamburger).toHaveClass("lg:hidden");
    const drawer = openDrawer();
    expect(labelsIn(drawer)).toEqual(expectedLabels("patient"));
    expect(within(drawer).getByText("Patient Person")).toBeInTheDocument();
    expect(within(drawer).getByText("patient@example.com")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(drawer).getAllByRole("link", { name: "Profile" })).toHaveLength(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  test("patient drawer route selection updates the route, closes, activates Sidebar, and preserves the Outlet", () => {
    setAuthenticatedUser(patientUser);
    const originalUser = integrationState.auth.user;
    const { container } = renderNavigation();
    const outlet = screen.getByTestId("route-content");
    const navbar = container.querySelector("nav");
    const healthInfo = getNavigation("patient").find(
      (item) => item.labelKey === "navbar.myHealthInfo",
    );

    const drawer = openDrawer();
    fireEvent.click(
      within(drawer).getByRole("link", {
        name: i18n.t(healthInfo.labelKey),
      }),
    );

    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent(healthInfo.to);
    expect(screen.getByTestId("route-content")).toBe(outlet);
    expect(container.querySelector("nav")).toBe(navbar);
    expect(
      within(getSidebarNavigation(container)).getByRole("link", {
        name: i18n.t(healthInfo.labelKey),
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(integrationState.auth.logout).not.toHaveBeenCalled();
    expect(integrationState.notifications.markOne).not.toHaveBeenCalled();
    expect(integrationState.notifications.markAll).not.toHaveBeenCalled();
    expect(integrationState.auth.user).toBe(originalUser);
    expect(integrationState.auth.isAuthenticated).toBe(true);
  });

  test("the real App keeps its authenticated navigation shell across a registered route change", async () => {
    setAuthenticatedUser(patientUser);
    const { container } = render(
      <MemoryRouter initialEntries={["/docrecords/myhealthinfo"]}>
        <App />
      </MemoryRouter>,
    );

    const initialPage = await screen.findByTestId("app-route-content");
    expect(initialPage).toHaveTextContent("My health info page");
    const navbar = container.querySelector("nav");
    const sidebar = container.querySelector("aside");
    const outletShell = initialPage.parentElement;

    const drawer = openDrawer();
    fireEvent.click(
      within(drawer).getByRole("link", { name: "My children" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("app-route-content")).toHaveTextContent(
        "My children page",
      );
    });
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(container.querySelector("nav")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
    expect(screen.getByTestId("app-route-content").parentElement).toBe(
      outletShell,
    );
    expect(
      within(getSidebarNavigation(container)).getByRole("link", {
        name: "My children",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(integrationState.auth.checkAuth).toHaveBeenCalled();
    expect(integrationState.auth.logout).not.toHaveBeenCalled();
  });

  test("verified doctor Sidebar and drawer contain only doctor destinations and account footers", () => {
    setAuthenticatedUser(doctorUser);
    const { container } = renderNavigation();

    const sidebarNavigation = getSidebarNavigation(container);
    expect(labelsIn(sidebarNavigation)).toEqual([
      "Home",
      "Patients",
      "Calendar",
      "Profile",
    ]);
    const drawer = openDrawer();
    expect(labelsIn(drawer)).toEqual(expectedLabels("doctor"));
    expect(within(container.querySelector("aside")).getByText("Doctor Person")).toBeInTheDocument();
    expect(within(drawer).getByText("Doctor Person")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    for (const label of [
      "My health state",
      "My health info",
      "My children",
    ]) {
      expect(
        within(sidebarNavigation).queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
      expect(
        within(drawer).queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("Sidebar Logout awaits logout and navigates to login", async () => {
    setAuthenticatedUser(patientUser);
    const { container } = renderNavigation("/profile");

    fireEvent.click(
      within(container.querySelector("aside")).getByRole("button", {
        name: "Logout",
      }),
    );

    await waitFor(() =>
      expect(integrationState.auth.logout).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByTestId("route-path")).toHaveTextContent("/login"),
    );
  });

  test("drawer Logout closes before logout and navigates to login", async () => {
    const events = [];
    integrationState.auth.logout = vi.fn(() => {
      events.push("logout");
      return Promise.resolve();
    });
    setAuthenticatedUser(doctorUser);
    renderNavigation("/calendar");
    const drawer = openDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: "Logout" }));

    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(events).toEqual(["logout"]);
    await waitFor(() =>
      expect(screen.getByTestId("route-path")).toHaveTextContent("/login"),
    );
  });

  test.each([
    "/patients/patient-1",
    "/diagnosis/patient/patient-1/diagnosis-1",
  ])("nested doctor route %s marks Patients active in Sidebar and drawer", (path) => {
    setAuthenticatedUser(doctorUser);
    const { container } = renderNavigation(path);

    expect(
      within(getSidebarNavigation(container)).getByRole("link", {
        name: "Patients",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(openDrawer()).getByRole("link", { name: "Patients" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("guest has public controls and no private navigation", () => {
    const { container } = renderNavigation();

    expect(container.querySelector("aside")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  test("unverified authenticated user has only Verify email and Logout account actions", () => {
    setAuthenticatedUser({ ...patientUser, isVerified: false });
    const { container } = renderNavigation();

    expect(container.querySelector("aside")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    const userMenu = openUserMenu();
    expect(
      within(userMenu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent.trim()),
    ).toEqual(["Verify email", "Logout"]);
    expect(
      within(userMenu).queryByRole("menuitem", { name: "Profile" }),
    ).not.toBeInTheDocument();
    expect(
      within(userMenu).queryByRole("menuitem", { name: "Calendar" }),
    ).not.toBeInTheDocument();
  });

  test("verified to unverified transition closes an open drawer", () => {
    setAuthenticatedUser(patientUser);
    const { container, rerenderNavigation } = renderNavigation();
    openDrawer();
    expect(document.body.style.overflow).toBe("hidden");

    integrationState.auth.user = { ...patientUser, isVerified: false };
    rerenderNavigation();

    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  test("authenticated to guest transition removes private navigation", () => {
    setAuthenticatedUser(patientUser);
    const { container, rerenderNavigation } = renderNavigation();
    expect(container.querySelector("aside")).not.toBeNull();

    setGuest();
    rerenderNavigation();

    expect(container.querySelector("aside")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toBeInTheDocument();
  });

  test("patient to doctor transition replaces open role navigation without stale links", () => {
    setAuthenticatedUser(patientUser);
    const { container, rerenderNavigation } = renderNavigation();
    expect(labelsIn(openDrawer())).toEqual(expectedLabels("patient"));

    integrationState.auth.user = doctorUser;
    rerenderNavigation();

    expect(labelsIn(getSidebarNavigation(container))).toEqual(
      expectedLabels("doctor"),
    );
    const drawer = screen.getByRole("dialog", { name: "Main navigation" });
    expect(labelsIn(drawer)).toEqual(expectedLabels("doctor"));
    expect(
      within(drawer).queryByRole("link", { name: "My children" }),
    ).not.toBeInTheDocument();
  });

  test("notifications coexist with navigation without duplication or auth mutation", () => {
    setAuthenticatedUser(patientUser);
    const { container } = renderNavigation();

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      screen.getByRole("dialog", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Main navigation" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("aside")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Main navigation" }));
    expect(
      screen.queryByRole("dialog", { name: "Notifications" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("dialog", { name: "Main navigation" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(integrationState.auth.logout).not.toHaveBeenCalled();
    expect(integrationState.notifications.markOne).not.toHaveBeenCalled();
    expect(integrationState.notifications.markAll).not.toHaveBeenCalled();
  });

  test("checking-auth rerender retains the stable Outlet after initial resolution", () => {
    setAuthenticatedUser(patientUser);
    const { container, rerenderNavigation } = renderNavigation();
    const navbar = container.querySelector("nav");
    const sidebar = container.querySelector("aside");
    const outlet = screen.getByTestId("route-content");
    expect(navbar).not.toBeNull();
    expect(sidebar).not.toBeNull();

    integrationState.auth.isCheckingAuth = true;
    rerenderNavigation();

    expect(container.querySelector("nav")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
    expect(screen.getByTestId("route-content")).toBe(outlet);
    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(
      screen.queryByRole("button", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Notifications" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Profile" }),
    ).not.toBeInTheDocument();

    integrationState.auth.isCheckingAuth = false;
    rerenderNavigation();
    expect(container.querySelector("nav")).toBe(navbar);
    expect(container.querySelector("aside")).toBe(sidebar);
    expect(screen.getByTestId("route-content")).toBe(outlet);
    expect(
      screen.getAllByRole("button", { name: "Main navigation" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Notifications" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(integrationState.auth.logout).not.toHaveBeenCalled();
  });
});

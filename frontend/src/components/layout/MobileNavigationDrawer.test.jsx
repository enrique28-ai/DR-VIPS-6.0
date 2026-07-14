import { useRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import MobileNavigationDrawer from "./MobileNavigationDrawer.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "common.close": "Close",
        "navbar.mainNavigation": "Main navigation",
        "navbar.home": "Home",
        "navbar.patients": "Patients",
        "calendar.menu": "Calendar",
        "navbar.profile": "Profile",
        "navbar.myHealthState": "My health state",
        "navbar.myHealthInfo": "My health information",
        "navbar.myChildren": "My children",
        "navbar.logout": "Logout",
      })[key] ?? key,
  }),
}));

const users = {
  patient: {
    name: "Patient Person",
    email: "patient@example.com",
    avatar: "https://example.com/patient.png",
  },
  doctor: {
    name: "Doctor Person",
    email: "doctor@example.com",
  },
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function DrawerHarness({
  open = true,
  role = "patient",
  user = users[role],
  logout = vi.fn().mockResolvedValue(undefined),
  onClose,
}) {
  const triggerRef = useRef(null);

  return (
    <>
      <button ref={triggerRef} type="button">
        Open navigation
      </button>
      <MobileNavigationDrawer
        open={open}
        role={role}
        user={user}
        logout={logout}
        onClose={onClose}
        triggerRef={triggerRef}
      />
      <LocationProbe />
    </>
  );
}

const renderDrawer = ({
  open = true,
  role = "patient",
  pathname = "/",
  onClose = vi.fn(),
  user = users[role],
  logout = vi.fn().mockResolvedValue(undefined),
} = {}) => ({
  onClose,
  logout,
  ...render(
    <MemoryRouter initialEntries={[pathname]}>
      <DrawerHarness
        open={open}
        role={role}
        user={user}
        logout={logout}
        onClose={onClose}
      />
    </MemoryRouter>,
  ),
});

let mediaChangeListeners;

beforeEach(() => {
  mediaChangeListeners = new Set();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: (_event, listener) => mediaChangeListeners.add(listener),
      removeEventListener: (_event, listener) =>
        mediaChangeListeners.delete(listener),
    })),
  });
});

afterEach(() => {
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("MobileNavigationDrawer", () => {
  test("closed drawer renders nothing", () => {
    renderDrawer({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("unsupported role renders nothing", () => {
    renderDrawer({ role: "admin" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("doctor drawer renders doctor navigation and no patient-only links", () => {
    renderDrawer({ role: "doctor" });

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Patients" })).toHaveAttribute(
      "href",
      "/patients",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(
      screen.queryByRole("link", { name: "My health state" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My health information" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My children" }),
    ).not.toBeInTheDocument();
  });

  test("patient drawer renders patient navigation and no Patients link", () => {
    renderDrawer({ role: "patient" });

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "My health state" }),
    ).toHaveAttribute("href", "/docrecords/myhealthstate");
    expect(
      screen.getByRole("link", { name: "My health information" }),
    ).toHaveAttribute("href", "/docrecords/myhealthinfo");
    expect(screen.getByRole("link", { name: "My children" })).toHaveAttribute(
      "href",
      "/docrecords/mychildren",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(
      screen.queryByRole("link", { name: "Patients" }),
    ).not.toBeInTheDocument();
  });

  test.each(["patient", "doctor"])(
    "%s drawer renders the account footer and Profile only once as navigation",
    (role) => {
      renderDrawer({ role });
      const dialog = screen.getByRole("dialog", { name: "Main navigation" });

      expect(within(dialog).getByText(users[role].name)).toBeInTheDocument();
      expect(within(dialog).getByText(users[role].email)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Logout" })).toBeInTheDocument();
      expect(within(dialog).getAllByRole("link", { name: "Profile" })).toHaveLength(1);
    },
  );

  test("drawer Logout closes before logout and navigates to login", async () => {
    const events = [];
    const onClose = vi.fn(() => events.push("close"));
    const logout = vi.fn(() => {
      events.push("logout");
      return Promise.resolve();
    });
    renderDrawer({ onClose, logout, pathname: "/calendar" });

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(events).toEqual(["close", "logout"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/login"),
    );
  });

  test("marks Patients active for a nested doctor diagnosis route", () => {
    renderDrawer({
      role: "doctor",
      pathname: "/diagnosis/patient/patient-1/diagnosis-1",
    });

    expect(screen.getByRole("link", { name: "Patients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("marks My Children active for a nested patient child route", () => {
    renderDrawer({
      role: "patient",
      pathname: "/docrecords/mychildren/child-1/health-state",
    });

    expect(screen.getByRole("link", { name: "My children" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("clicking a navigation link updates the route without closing the drawer", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/calendar");
    expect(screen.getByRole("dialog", { name: "Main navigation" })).toBeInTheDocument();
  });

  test("clicking the backdrop does not close persistent navigation", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByTestId("mobile-navigation-backdrop"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("clicking inside the drawer panel does not call onClose", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByRole("dialog", { name: "Main navigation" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  test("Escape calls onClose and restores focus to the trigger", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  test("the persistent drawer does not trap Tab focus", () => {
    renderDrawer();
    const logoutButton = screen.getByRole("button", { name: "Logout" });
    logoutButton.focus();

    expect(logoutButton).toHaveFocus();
    expect(fireEvent.keyDown(window, { key: "Tab" })).toBe(true);
    expect(logoutButton).toHaveFocus();
  });

  test("opening does not lock document body scrolling", () => {
    document.body.style.overflow = "clip";
    const { unmount } = renderDrawer();

    expect(document.body.style.overflow).toBe("clip");
    unmount();

    expect(document.body.style.overflow).toBe("clip");
  });

  test("desktop breakpoint setup does not automatically close navigation", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    expect(onClose).not.toHaveBeenCalled();
    expect(mediaChangeListeners.size).toBe(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("unmount removes the drawer keyboard listener", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderDrawer();

    unmount();

    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  test("dialog has an accessible name", () => {
    renderDrawer();

    expect(
      screen.getByRole("dialog", { name: "Main navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "false");
  });

  test("drawer is positioned below the Navbar and has no internal close button", () => {
    renderDrawer();

    const overlay = screen.getByTestId("mobile-navigation-backdrop").parentElement;
    expect(overlay).toHaveClass(
      "pointer-events-none",
      "top-16",
      "bottom-0",
      "z-30",
      "lg:hidden",
    );
    expect(screen.getByRole("dialog")).toHaveClass(
      "pointer-events-auto",
      "ml-auto",
      "border-l",
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("border-r");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});

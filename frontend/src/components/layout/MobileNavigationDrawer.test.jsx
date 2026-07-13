import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
      })[key] ?? key,
  }),
}));

function DrawerHarness({ open = true, role = "patient", onClose }) {
  const triggerRef = useRef(null);

  return (
    <>
      <button ref={triggerRef} type="button">
        Open navigation
      </button>
      <MobileNavigationDrawer
        open={open}
        role={role}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    </>
  );
}

function ResponsiveDrawerHarness({ role = "patient", onClose }) {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef(null);
  const handleClose = () => {
    onClose();
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef} type="button">
        Open navigation
      </button>
      <MobileNavigationDrawer
        open={open}
        role={role}
        onClose={handleClose}
        triggerRef={triggerRef}
      />
    </>
  );
}

const renderDrawer = ({
  open = true,
  role = "patient",
  pathname = "/",
  onClose = vi.fn(),
} = {}) => ({
  onClose,
  ...render(
    <MemoryRouter initialEntries={[pathname]}>
      <DrawerHarness open={open} role={role} onClose={onClose} />
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

  test("clicking a navigation link calls onClose", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(screen.getByTestId("mobile-navigation-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
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

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  test("close button calls onClose and restores focus to the trigger", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  test("Tab and Shift+Tab wrap focus within the modal drawer", () => {
    renderDrawer();
    const closeButton = screen.getByRole("button", { name: "Close" });
    const lastLink = screen.getByRole("link", { name: "Profile" });

    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(lastLink).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();
  });

  test("opening locks body scroll and cleanup restores the previous value", () => {
    document.body.style.overflow = "clip";
    const { unmount } = renderDrawer();

    expect(document.body.style.overflow).toBe("hidden");
    unmount();

    expect(document.body.style.overflow).toBe("clip");
  });

  test("crossing to desktop closes and cleans up without focusing the hidden trigger", () => {
    document.body.style.overflow = "auto";
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ResponsiveDrawerHarness onClose={onClose} />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    const changeListener = [...mediaChangeListeners][0];

    expect(document.body.style.overflow).toBe("hidden");
    act(() => changeListener({ matches: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(trigger).not.toHaveFocus();
    expect(mediaChangeListeners.size).toBe(0);
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
  });
});

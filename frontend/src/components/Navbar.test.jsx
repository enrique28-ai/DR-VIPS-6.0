import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Navbar from "./Navbar.jsx";

const navigateMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const authState = vi.hoisted(() => ({
  user: null,
  isAuthenticated: false,
  isCheckingAuth: true,
  logout: logoutMock,
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (selector) =>
    selector
      ? selector(authState)
      : {
          user: authState.user,
          isAuthenticated: authState.isAuthenticated,
          isCheckingAuth: authState.isCheckingAuth,
          logout: authState.logout,
        },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "navbar.whoCanAccess": "Who can access",
        "navbar.login": "Log in",
        "navbar.register": "Sign up",
        "navbar.hi": "Hi",
        "navbar.verifyEmail": "Verify email",
        "navbar.logout": "Logout",
        "calendar.menu": "Calendar",
        "navbar.myHealthState": "My health state",
        "navbar.profile": "Profile",
        "navbar.myChildren": "My children",
        "navbar.patients": "Patients",
      })[key] ?? key,
  }),
}));

vi.mock("./language/LanguageSwitcher.jsx", () => ({
  LanguageSwitcher: () => (
    <span data-testid="language-switcher-stub">Language</span>
  ),
}));

vi.mock("./layout/NotificationBell.jsx", () => ({
  default: () => (
    <span data-testid="notification-bell-stub">Notifications</span>
  ),
}));

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );

const getAvatarButton = (container) =>
  container.querySelector('button[aria-haspopup="menu"]');

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logoutMock.mockClear();
    logoutMock.mockResolvedValue(undefined);
    navigateMock.mockReset();
    authState.user = null;
    authState.isAuthenticated = false;
    authState.isCheckingAuth = true;
    authState.logout = logoutMock;
  });

  test("checking-auth state shows brand, LanguageSwitcher, and no auth controls", () => {
    authState.user = null;
    authState.isAuthenticated = false;
    authState.isCheckingAuth = true;

    const { container } = renderNavbar();

    expect(screen.getByText("DR-VIPS")).toBeInTheDocument();
    expect(screen.getByTestId("language-switcher-stub")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
    expect(getAvatarButton(container)).toBeNull();
  });

  test("guest state shows brand, LanguageSwitcher, Eligibility, Log in, and Sign up", () => {
    authState.user = null;
    authState.isAuthenticated = false;
    authState.isCheckingAuth = false;

    renderNavbar();

    expect(screen.getByText("DR-VIPS")).toBeInTheDocument();
    expect(screen.getByTestId("language-switcher-stub")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Who can access" }),
    ).toHaveAttribute("href", "/eligibility");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  test("authenticated unverified user shows avatar initial, no greeting, and no NotificationBell", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("D");
    expect(screen.queryByText(/^Hi\s/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("notification-bell-stub")).not.toBeInTheDocument();
  });

  test("opening the menu shows Verify Email and Logout with aria-expanded true", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    fireEvent.click(avatar);

    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Verify email" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  test("clicking Verify Email navigates to /verify-email", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    fireEvent.click(getAvatarButton(container));
    fireEvent.click(screen.getByRole("menuitem", { name: "Verify email" }));

    expect(navigateMock).toHaveBeenCalledWith("/verify-email");
  });

  test("clicking Logout awaits logout and navigates to /login with replace", async () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    fireEvent.click(getAvatarButton(container));
    fireEvent.click(screen.getByRole("menuitem", { name: "Logout" }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  test("verified patient renders NotificationBell and greeting using the first name from user.name", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    renderNavbar();

    expect(screen.getByTestId("notification-bell-stub")).toBeInTheDocument();
    expect(
      screen.getByText((_text, element) => {
        return element?.textContent.replace(/\s+/g, " ").trim() === "Hi Dr";
      }),
    ).toBeInTheDocument();
  });

  test("verified patient menu shows Calendar, My Health State, Profile, My Children, and Logout", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    fireEvent.click(getAvatarButton(container));

    expect(
      screen.getByRole("menuitem", { name: "Calendar" }),
    ).toHaveAttribute("href", "/calendar");
    expect(
      screen.getByRole("menuitem", { name: "My health state" }),
    ).toHaveAttribute("href", "/docrecords/myhealthstate");
    expect(
      screen.getByRole("menuitem", { name: "Profile" }),
    ).toHaveAttribute("href", "/profile");
    expect(
      screen.getByRole("menuitem", { name: "My children" }),
    ).toHaveAttribute("href", "/docrecords/mychildren");
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  test("verified doctor with no name derives greeting from user.email and renders NotificationBell", () => {
    authState.user = {
      name: "",
      email: "doctor@example.com",
      isVerified: true,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    renderNavbar();

    expect(screen.getByTestId("notification-bell-stub")).toBeInTheDocument();
    expect(
      screen.getByText((_text, element) => {
        return (
          element?.textContent.replace(/\s+/g, " ").trim() === "Hi doctor"
        );
      }),
    ).toBeInTheDocument();
  });

  test("verified doctor menu shows Calendar, Patients, Profile, and Logout", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    fireEvent.click(getAvatarButton(container));

    expect(
      screen.getByRole("menuitem", { name: "Calendar" }),
    ).toHaveAttribute("href", "/calendar");
    expect(
      screen.getByRole("menuitem", { name: "Patients" }),
    ).toHaveAttribute("href", "/patients");
    expect(
      screen.getByRole("menuitem", { name: "Profile" }),
    ).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  test("renders img alt=avatar with the avatar src when user.avatar is set", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      avatar: "https://example.com/avatar.png",
      isVerified: true,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatarImg = container.querySelector(
      'button[aria-haspopup="menu"] img[alt="avatar"]',
    );
    expect(avatarImg).not.toBeNull();
    expect(avatarImg.getAttribute("src")).toBe("https://example.com/avatar.png");
  });

  test("outside click closes an open menu", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    fireEvent.click(avatar);
    expect(
      screen.getByRole("menuitem", { name: "Verify email" }),
    ).toBeInTheDocument();

    fireEvent.click(document.body);

    expect(
      screen.queryByRole("menuitem", { name: "Verify email" }),
    ).not.toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking a verified patient menu link closes the menu", () => {
    authState.user = {
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    fireEvent.click(avatar);
    expect(
      screen.getByRole("menuitem", { name: "Profile" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));

    expect(
      screen.queryByRole("menuitem", { name: "Profile" }),
    ).not.toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  test("avatar initial comes from user.email when user.name is missing", () => {
    authState.user = {
      name: "",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("D");
  });

  test("avatar initial falls back to U when name and email are missing", () => {
    authState.user = {
      isVerified: false,
      role: "doctor",
    };
    authState.isAuthenticated = true;
    authState.isCheckingAuth = false;

    const { container } = renderNavbar();

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("U");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import UserMenu from "./UserMenu.jsx";

const navigateMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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
        "navbar.hi": "Hi",
        "navbar.verifyEmail": "Verify email",
        "navbar.logout": "Logout",
        "calendar.menu": "Calendar",
        "navbar.myHealthState": "My health state",
        "navbar.myHealthInfo": "My health information",
        "navbar.profile": "Profile",
        "navbar.myChildren": "My children",
        "navbar.patients": "Patients",
      })[key] ?? key,
  }),
}));

const renderMenu = (user = {}, logout = logoutMock) =>
  render(
    <MemoryRouter>
      <UserMenu user={user} logout={logout} />
    </MemoryRouter>,
  );

const getAvatarButton = (container) =>
  container.querySelector('button[aria-haspopup="menu"]');

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logoutMock.mockClear();
    logoutMock.mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  test("renders avatar initial from user.name", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("D");
  });

  test("renders avatar initial from user.email when name is missing", () => {
    const { container } = renderMenu({
      name: "",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("D");
  });

  test("falls back to U when name and email are missing", () => {
    const { container } = renderMenu({
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe("U");
  });

  test("renders img alt=avatar with the avatar src when user.avatar is set", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      avatar: "https://example.com/avatar.png",
      isVerified: true,
      role: "doctor",
    });

    const avatarImg = container.querySelector(
      'button[aria-haspopup="menu"] img[alt="avatar"]',
    );
    expect(avatarImg).not.toBeNull();
    expect(avatarImg.getAttribute("src")).toBe("https://example.com/avatar.png");
  });

  test("toggling the avatar button opens and closes the menu", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(avatar);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(avatar);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  test("outside click closes an open menu", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

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

  test("Escape closes an open menu and restores focus to the avatar button", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    fireEvent.click(avatar);
    expect(
      screen.getByRole("menuitem", { name: "Verify email" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("menuitem", { name: "Verify email" }),
    ).not.toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(avatar).toHaveFocus();
  });

  test("unverified user sees Verify Email and Logout in the menu", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    const avatar = getAvatarButton(container);
    expect(avatar).toHaveAccessibleName("Profile");
    expect(avatar).toHaveAttribute("aria-controls", "navbar-user-menu");
    fireEvent.click(avatar);

    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toHaveAttribute("id", "navbar-user-menu");
    expect(screen.getByRole("menuitem", { name: "Verify email" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  test("clicking Verify Email navigates to /verify-email", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    fireEvent.click(getAvatarButton(container));
    fireEvent.click(screen.getByRole("menuitem", { name: "Verify email" }));

    expect(navigateMock).toHaveBeenCalledWith("/verify-email");
  });

  test("verified patient menu shows Calendar, My Health State, My Health Information, My Children, Profile, and Logout", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    });

    fireEvent.click(getAvatarButton(container));

    expect(
      screen.getByRole("menuitem", { name: "Calendar" }),
    ).toHaveAttribute("href", "/calendar");
    expect(
      screen.getByRole("menuitem", { name: "My health state" }),
    ).toHaveAttribute("href", "/docrecords/myhealthstate");
    expect(
      screen.getByRole("menuitem", { name: "My health information" }),
    ).toHaveAttribute("href", "/docrecords/myhealthinfo");
    expect(
      screen.getByRole("menuitem", { name: "My children" }),
    ).toHaveAttribute("href", "/docrecords/mychildren");
    expect(
      screen.getByRole("menuitem", { name: "Profile" }),
    ).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  test("verified role navigation is mobile-only while Profile is shared and rendered once", () => {
    const { container } = renderMenu({
      name: "Patient Person",
      email: "patient@example.com",
      isVerified: true,
      role: "patient",
    });

    fireEvent.click(getAvatarButton(container));

    const roleNavigation = screen
      .getByRole("menuitem", { name: "Calendar" })
      .closest("div");
    const profile = screen.getByRole("menuitem", { name: "Profile" });

    expect(roleNavigation).toHaveClass("lg:hidden");
    expect(roleNavigation).toContainElement(
      screen.getByRole("menuitem", { name: "My health information" }),
    );
    expect(roleNavigation).not.toContainElement(profile);
    expect(screen.getAllByRole("menuitem", { name: "Profile" })).toHaveLength(1);
  });

  test("clicking a verified patient menu link closes the menu", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    });

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

  test("verified doctor menu shows Calendar, Patients, Profile, and Logout", () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "doctor",
    });

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
    expect(
      screen.queryByRole("menuitem", { name: "My health state" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "My health information" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "My children" }),
    ).not.toBeInTheDocument();
  });

  test("verified user sees greeting with first name from user.name", () => {
    renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: true,
      role: "patient",
    });

    expect(
      screen.getByText((_text, element) => {
        return element?.textContent.replace(/\s+/g, " ").trim() === "Hi Dr";
      }),
    ).toBeInTheDocument();
  });

  test("verified user with no name derives greeting from user.email", () => {
    renderMenu({
      name: "",
      email: "doctor@example.com",
      isVerified: true,
      role: "doctor",
    });

    expect(
      screen.getByText((_text, element) => {
        return (
          element?.textContent.replace(/\s+/g, " ").trim() === "Hi doctor"
        );
      }),
    ).toBeInTheDocument();
  });

  test("unverified user does not see greeting", () => {
    renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    expect(screen.queryByText(/^Hi\s/)).not.toBeInTheDocument();
  });

  test("clicking Logout awaits logout and navigates to /login with replace", async () => {
    const { container } = renderMenu({
      name: "Dr Person",
      email: "doctor@example.com",
      isVerified: false,
      role: "doctor",
    });

    fireEvent.click(getAvatarButton(container));
    fireEvent.click(screen.getByRole("menuitem", { name: "Logout" }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});

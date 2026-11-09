import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NavigationAccount from "./NavigationAccount.jsx";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => ({ "navbar.logout": "Logout" })[key] ?? key,
  }),
}));

vi.mock("../../stores/authStore.js", () => {
  throw new Error("NavigationAccount must not import authStore");
});

const user = {
  name: "Patient Person",
  email: "patient@example.com",
};

const renderAccount = (props = {}) =>
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <NavigationAccount
        user={user}
        logout={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </MemoryRouter>,
  );

describe("NavigationAccount", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  test("renders the current avatar with meaningful alternative text", () => {
    renderAccount({
      user: { ...user, avatar: "https://example.com/patient.png" },
    });

    expect(
      screen.getByRole("img", { name: "Patient Person avatar" }),
    ).toHaveAttribute("src", "https://example.com/patient.png");
  });

  test("renders the uppercase fallback initial without an avatar", () => {
    renderAccount();

    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("falls back to the email initial when the name is absent", () => {
    renderAccount({ user: { name: "", email: "email@example.com" } });

    expect(screen.getByText("E")).toBeInTheDocument();
  });

  test("renders the account name and email", () => {
    renderAccount();

    expect(screen.getByText("Patient Person")).toBeInTheDocument();
    expect(screen.getByText("patient@example.com")).toBeInTheDocument();
  });

  test("renders an accessible semantic Logout button and no Profile link", () => {
    renderAccount();

    const logoutButton = screen.getByRole("button", { name: "Logout" });
    expect(logoutButton).toHaveAttribute("type", "button");
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
  });

  test("runs onBeforeLogout, awaits logout, then navigates with replacement", async () => {
    const events = [];
    let resolveLogout;
    const logout = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveLogout = () => {
            events.push("logout resolved");
            resolve();
          };
        }),
    );
    const onBeforeLogout = vi.fn(() => events.push("before logout"));
    renderAccount({ logout, onBeforeLogout });

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(onBeforeLogout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["before logout"]);
    expect(navigateMock).not.toHaveBeenCalled();

    resolveLogout();

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true }),
    );
    expect(events).toEqual(["before logout", "logout resolved"]);
  });

  test("renders without an authStore provider or dependency", () => {
    expect(() => renderAccount()).not.toThrow();
  });
});

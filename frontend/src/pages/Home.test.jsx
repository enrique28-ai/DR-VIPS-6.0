import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Home from "./Home.jsx";

const authState = vi.hoisted(() => ({
  user: null,
  isAuthenticated: false,
  isCheckingAuth: true,
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (selector) =>
    selector
      ? selector(authState)
      : {
          user: authState.user,
          isAuthenticated: authState.isAuthenticated,
          isCheckingAuth: authState.isCheckingAuth,
        },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "home.title": "DR-VIPS",
        "home.tagline": "Your health workspace",
        "home.description.general": "General home description",
        "home.description.patient": "Patient home description",
        "home.description.doctor": "Doctor home description",
        "home.cta.checking": "Checking session",
        "home.cta.patient": "Go to my health state",
        "home.cta.doctor": "Go to patients",
        "home.cta.signIn": "Sign in",
        "home.noAccount": "No account yet?",
        "home.createAccount": "Create account",
        "home.workspace.title": "Workspace",
        "home.workspace.subtitle": "Manage health records",
      })[key] ?? key,
  }),
}));

const renderHome = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

const resetAuth = () => {
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isCheckingAuth = true;
};

describe("Home", () => {
  beforeEach(() => {
    resetAuth();
  });

  test("renders title, tagline, general description, workspace text, and DR-VIPS logo", () => {
    authState.isCheckingAuth = true;
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "DR-VIPS" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your health workspace")).toBeInTheDocument();
    expect(screen.getByText("General home description")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Manage health records")).toBeInTheDocument();
    expect(
      screen.getByAltText("DR-VIPS Logo"),
    ).toBeInTheDocument();
  });

  test("guest state shows sign-in CTA and create-account link", () => {
    authState.isCheckingAuth = false;
    authState.isAuthenticated = false;
    authState.user = null;
    renderHome();

    const cta = screen.getByRole("link", { name: /Sign in/ });
    expect(cta).toHaveAttribute("href", "/login");

    expect(
      screen.getByText((_text, element) => {
        return element?.textContent.startsWith("No account yet?");
      }),
    ).toBeInTheDocument();
    const createAccount = screen.getByRole("link", { name: "Create account" });
    expect(createAccount).toHaveAttribute("href", "/signup");
  });

  test("authenticated patient state shows patient CTA and no create-account link", () => {
    authState.isCheckingAuth = false;
    authState.isAuthenticated = true;
    authState.user = { role: "patient" };
    renderHome();

    const cta = screen.getByRole("link", { name: /Go to my health state/ });
    expect(cta).toHaveAttribute("href", "/docrecords/myhealthstate");

    expect(screen.getByText("Patient home description")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  test("authenticated doctor state shows doctor CTA and no create-account link", () => {
    authState.isCheckingAuth = false;
    authState.isAuthenticated = true;
    authState.user = { role: "doctor" };
    renderHome();

    const cta = screen.getByRole("link", { name: /Go to patients/ });
    expect(cta).toHaveAttribute("href", "/patients");

    expect(screen.getByText("Doctor home description")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  test("checking-auth state shows disabled CTA with aria-disabled true", () => {
    authState.isCheckingAuth = true;
    authState.isAuthenticated = false;
    authState.user = null;
    renderHome();

    const cta = screen.getByRole("link", { name: /Checking session/ });
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });
});

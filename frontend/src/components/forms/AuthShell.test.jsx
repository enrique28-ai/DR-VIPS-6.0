import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import AuthShell from "./AuthShell.jsx";

describe("AuthShell", () => {
  test("renders title as a level-1 heading", () => {
    render(
      <AuthShell title="Create account">
        <span>body</span>
      </AuthShell>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Create account" }),
    ).toBeInTheDocument();
  });

  test("renders string children inside the shell", () => {
    render(<AuthShell title="Login">Hello body</AuthShell>);

    expect(screen.getByText("Hello body")).toBeInTheDocument();
  });

  test("renders React node children", () => {
    render(
      <AuthShell title="Login">
        <button type="button">Go</button>
      </AuthShell>,
    );

    expect(
      screen.getByRole("button", { name: "Go" }),
    ).toBeInTheDocument();
  });

  test("renders multiple children", () => {
    render(
      <AuthShell title="Login">
        <span>first</span>
        <span>second</span>
        <span>third</span>
      </AuthShell>,
    );

    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.getByText("third")).toBeInTheDocument();
  });

  test("keeps the full-width max-w-lg card with responsive horizontal padding", () => {
    render(<AuthShell title="Login">Responsive body</AuthShell>);

    const heading = screen.getByRole("heading", { name: "Login" });
    const header = heading.parentElement;
    const card = header.parentElement;
    const content = screen.getByText("Responsive body");

    expect(card).toHaveClass("w-full", "max-w-lg");
    expect(header).toHaveClass("px-4", "sm:px-8");
    expect(content).toHaveClass("px-4", "sm:px-8");
  });

  test("allows an empty title string without throwing and still renders the h1", () => {
    render(
      <AuthShell title="">
        <span>body</span>
      </AuthShell>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe("");
  });
});

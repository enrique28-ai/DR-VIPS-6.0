import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Button from "./Button.jsx";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

const renderButton = (props = {}) =>
  render(
    <Button {...props}>
      <span>Click me</span>
    </Button>,
  );

describe("Button", () => {
  test("renders children", () => {
    renderButton();
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  test("defaults to type=\"button\"", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Click me" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  test("supports type=\"submit\"", () => {
    renderButton({ type: "submit" });
    expect(screen.getByRole("button", { name: "Click me" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  test("calls onClick once when clicked", () => {
    const onClick = vi.fn();
    renderButton({ onClick });

    fireEvent.click(screen.getByRole("button", { name: "Click me" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("disabled disables the button, sets aria-disabled, and prevents onClick", () => {
    const onClick = vi.fn();
    renderButton({ disabled: true, onClick });

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("loading disables the button and sets aria-busy and aria-disabled", () => {
    renderButton({ loading: true });

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  test("loading renders a spinner as an aria-hidden element", () => {
    renderButton({ loading: true });

    const button = screen.getByRole("button", { name: "Click me" });
    const spinner = button.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
  });

  test("full=false still renders an enabled usable button", () => {
    renderButton({ full: false });

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  test.each(["primary", "secondary", "ghost", "danger"])(
    "renders without crashing for variant %s",
    (variant) => {
      renderButton({ variant });

      const button = screen.getByRole("button", { name: "Click me" });
      expect(button).toBeInTheDocument();
    },
  );

  test("forwards custom className to the button", () => {
    renderButton({ className: "extra-class" });

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button.className).toContain("extra-class");
  });
});

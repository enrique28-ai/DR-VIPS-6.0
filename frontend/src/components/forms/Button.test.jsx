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

  test("forwards aria-pressed to the DOM", () => {
    renderButton({ "aria-pressed": "true" });
    expect(screen.getByRole("button", { name: "Click me" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("forwards aria-label to the DOM", () => {
    renderButton({ "aria-label": "Save changes" });
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Save changes");
  });

  test("forwards aria-controls and aria-expanded to the DOM", () => {
    renderButton({ "aria-controls": "panel-1", "aria-expanded": "true" });
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-controls", "panel-1");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  test("forwards id and name to the DOM", () => {
    renderButton({ id: "submit-btn", name: "action" });
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("id", "submit-btn");
    expect(button).toHaveAttribute("name", "action");
  });

  test("forwards onKeyDown handler", () => {
    const onKeyDown = vi.fn();
    renderButton({ onKeyDown });
    const button = screen.getByRole("button", { name: "Click me" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  test("forwards data attributes to the DOM", () => {
    renderButton({ "data-testid": "custom-btn", "data-foo": "bar" });
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-testid", "custom-btn");
    expect(button).toHaveAttribute("data-foo", "bar");
  });

  test("internal disabled wins over rest aria-disabled", () => {
    renderButton({ disabled: true, "aria-disabled": "false" });
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  test("internal loading wins over rest aria-busy", () => {
    renderButton({ loading: true, "aria-busy": "false" });
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
